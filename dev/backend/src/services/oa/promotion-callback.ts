/**
 * 促销活动审批回调
 * 三种促销活动类型共享的 beforeSubmit / onApproved 逻辑
 * @module services/oa/promotion-callback
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('PromotionCallback');

import type { OaInstanceRow, CallbackResult } from './oa.types';
import type { FormAccessor } from './form-accessor';
import {
  erpCreatePromotion,
  erpSaveCombinedSaleAndShelf,
  erpSaveSpecialOfferAndShelf,
  erpSaveFullGiftAndShelf,
  type PromotionType,
  type PromotionClientConfig,
  type CombinedSaleRule,
  type CombinedSaleGoods,
  type CombinedSalePresent,
  type SpecialOfferGoods,
  type FullGiftRule,
  type FullGiftMainGoods,
  type FullGiftLoopPresent,
  type FullGiftStepPresent,
} from '../erp-client/erp-promotion.service';

// =====================================================
// 工具函数
// =====================================================

/** 从表单数据构建参与客户配置 */
function buildClientConfig(formData: Record<string, unknown>): PromotionClientConfig {
  const issueRange = Number(formData.issueRange) || 1;
  const config: PromotionClientConfig = { issueRange };

  if (issueRange === 1) {
    // 按片区指定
    const areaIds = formData.clientAreaIds as number[] | undefined;
    config.clientRule = { areaList: areaIds || [] };
    config.clientIdList = null;
  } else {
    // 指定客户
    config.clientRule = null;
    config.clientIdList = (formData.clientIdList as number[]) || [];
  }

  return config;
}

/**
 * 标准化日期字符串为 YYYY-MM-DD
 * 兼容两种输入：
 * 1. "2026-06-26"（前端正确提交的纯日期字符串）
 * 2. "2026-06-25T16:00:00.000Z"（旧数据：Dayjs 对象经 JSON.stringify 序列化为 UTC ISO 格式，
 *    实际代表 UTC+8 的 2026-06-26）
 */
function normalizeDateString(dateStr: string): string {
  // 已是 YYYY-MM-DD（无 'T'，纯日期字符串）
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  // ISO datetime 格式：解析后转换为 UTC+8 的日期
  if (dateStr.includes('T')) {
    const utcMs = new Date(dateStr).getTime();
    const utcPlus8 = new Date(utcMs + 8 * 60 * 60 * 1000);
    return utcPlus8.toISOString().slice(0, 10);
  }
  // 其他格式：截取前10位
  return dateStr.slice(0, 10);
}

/** 从 date-range 提取起止日期 */
function extractDates(formData: Record<string, unknown>): { startDate: string; endDate: string } {
  const period = formData.promotionPeriod as [string, string] | undefined;
  if (!period || period.length < 2) {
    throw new Error('促销周期不能为空');
  }
  return {
    startDate: normalizeDateString(period[0]),
    endDate: normalizeDateString(period[1]),
  };
}

// =====================================================
// beforeSubmit：业务校验 + 利润率计算
// =====================================================

/**
 * 促销表单提交前校验（三种类型共享）
 * - 校验临期特价约束（限时特价专用）
 * - 校验阶梯满赠约束（满赠专用）
 * - formula 字段已由框架校验（防篡改机制）
 */
export async function beforeSubmitPromotion(
  formData: Record<string, unknown>,
  _userId: number
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  // ── 通用：列表非空校验 ──
  const presentList = formData.presentList as Array<unknown> | undefined;
  if (presentList !== undefined && presentList.length === 0) {
    throw new Error('赠品列表不能为空，请至少添加一个赠品');
  }
  const loopPresents = formData.loopPresents as Array<unknown> | undefined;
  if (loopPresents !== undefined && loopPresents.length === 0) {
    throw new Error('循环赠品列表不能为空，请至少添加一个赠品');
  }
  const stepPresentsRaw = formData.stepPresents as Array<unknown> | undefined;
  if (stepPresentsRaw !== undefined && stepPresentsRaw.length === 0) {
    throw new Error('阶梯赠品列表不能为空，请至少添加一个赠品');
  }

  // ── 限时特价：临期特价校验 ──
  const goodsList = formData.goodsList as Array<Record<string, unknown>> | undefined;
  if (goodsList) {
    for (let i = 0; i < goodsList.length; i++) {
      const row = goodsList[i];

      // 将平铺的 nearExpiryDays/Price 转为 goodsExts 数组（表单 schema 用平铺字段，回调期望数组结构）
      if (!row.goodsExts && (row.nearExpiryDays1 || row.nearExpiryDays2 || row.nearExpiryDays3)) {
        const exts: Array<{ nearExpiryDays: number; nearExpiryPrice: string }> = [];
        for (let k = 1; k <= 3; k++) {
          const days = row[`nearExpiryDays${k}`];
          const price = row[`nearExpiryPrice${k}`];
          if (days && price) exts.push({ nearExpiryDays: Number(days), nearExpiryPrice: String(price) });
        }
        if (exts.length > 0) row.goodsExts = exts;
      }

      const goodsExts = row.goodsExts as Array<{ nearExpiryDays: number; nearExpiryPrice: string }> | undefined;
      if (!goodsExts || goodsExts.length === 0) continue;

      // 最多3条
      if (goodsExts.length > 3) {
        throw new Error(`第${i + 1}行：临期特价最多配置3级`);
      }

      // 天数从大到小
      for (let j = 1; j < goodsExts.length; j++) {
        if (goodsExts[j].nearExpiryDays >= goodsExts[j - 1].nearExpiryDays) {
          throw new Error(`第${i + 1}行：临期天数必须从大到小排列`);
        }
      }

      const onSalePrice = Number(row.onSalePrice) || 0;
      const onSalePriceMin = Number(row.onSalePriceMin) || 0;

      // 最高临期价 = 促销价
      if (onSalePrice > 0 && Number(goodsExts[0].nearExpiryPrice) !== onSalePrice) {
        throw new Error(`第${i + 1}行：临期最高价须等于促销价`);
      }

      // 最低临期价 = 最低促销价
      if (onSalePriceMin > 0 && goodsExts.length > 1) {
        const lastPrice = Number(goodsExts[goodsExts.length - 1].nearExpiryPrice);
        if (lastPrice !== onSalePriceMin) {
          throw new Error(`第${i + 1}行：临期最低价须等于最低促销价`);
        }
      }
    }
  }

  // ── 满赠：阶梯校验 ──
  const stepRules = formData.stepRules as Array<Record<string, unknown>> | undefined;
  const stepPresents = formData.stepPresents as Array<Record<string, unknown>> | undefined;
  if (stepRules && stepRules.length > 0) {
    // 门槛递增校验
    for (let i = 1; i < stepRules.length; i++) {
      const prevLatch = Number(stepRules[i - 1].countLatch) || 0;
      const currLatch = Number(stepRules[i].countLatch) || 0;
      if (currLatch <= prevLatch) {
        throw new Error(`阶梯${i + 1}的门槛数量必须大于阶梯${i}`);
      }
    }

    // 每个阶梯必须有赠品
    if (stepPresents) {
      for (const rule of stepRules) {
        const seq = Number(rule.seq);
        const hasGift = stepPresents.some(p => Number(p.seq) === seq);
        if (!hasGift) {
          throw new Error(`阶梯${seq}必须至少关联1个赠品`);
        }
      }
    }
  }

  // ── 满赠：计算有效门槛（供利润公式使用） ──
  const onSaleType = formData.onSaleType as string | undefined;
  if (onSaleType === 'step') {
    const stepRulesForLatch = formData.stepRules as Array<Record<string, unknown>> | undefined;
    if (stepRulesForLatch && stepRulesForLatch.length > 0) {
      result._effectiveLatch = Number(stepRulesForLatch[0].countLatch) || 0;
    }
  } else if (onSaleType === 'loop') {
    result._effectiveLatch = Number(formData.loopCountLatch) || 0;
  }

  return result;
}

// =====================================================
// onApproved：审批通过后创建ERP促销活动
// =====================================================

/**
 * 线下组合搭赠：审批通过后回调
 */
export async function onApprovedPromotionCombinedOffline(
  _instance: OaInstanceRow,
  form: FormAccessor
): Promise<CallbackResult> {
  const rawData = form.getRawData();
  const { startDate, endDate } = extractDates(rawData);
  const clientConfig = buildClientConfig(rawData);

  // 1. 创建促销活动（幂等：重试时复用已创建的 promotionId）
  let promotionId = form.getNumber('promotionId');
  let promotionNo = form.getString('promotionNo');

  if (!promotionId) {
    const promotion = await erpCreatePromotion(
      'combinedSale',
      form.getString('name') ?? '',
      startDate,
      endDate,
      clientConfig,
      'ALL'
    );
    promotionId = promotion.promotionId;
    promotionNo = promotion.promotionNo;
  }

  // 2. 构建规则（固定模式传字符串，任选模式传数字）
  const goodsType = form.getNumber('goodsType') ?? 1;
  const presentType = form.getNumber('presentType') ?? 1;
  const isGoodsFixed = goodsType === 1;
  const isPresentFixed = presentType === 1;

  const wrapCount = (v: unknown, isFixed: boolean) => {
    if (!v && v !== 0) return undefined;
    const n = Number(v);
    return isFixed ? String(n) : n;
  };

  const rule: CombinedSaleRule = {
    goodsType,
    presentType,
    limitCountPerClient: isGoodsFixed && isPresentFixed
      ? String(form.getRaw('limitCountPerClient') || 1)
      : (form.getNumber('limitCountPerClient') ?? 1),
    totalCount: wrapCount(form.getRaw('totalCount'), isGoodsFixed && isPresentFixed),
    goodsCount: wrapCount(form.getRaw('goodsCount'), isGoodsFixed),
    giftCount: wrapCount(form.getRaw('giftCount'), isPresentFixed),
  };

  // 3. 构建主品列表
  const goodsList = form.getTableRecords('goodsList').map<CombinedSaleGoods>((row, index) => ({
    goodsId: Number(row.goodsId),
    currUnitId: String(row.currUnitId || 'BASE'),
    currUnitName: row.currUnitName ? String(row.currUnitName) : undefined,
    quantity: isGoodsFixed ? String(Number(row.quantity) || 1) : (Number(row.quantity) || 1),
    mustSelect: isGoodsFixed ? null : (row.mustSelect === true || row.mustSelect === 'true'),
    promotionPriceType: 'FIXED_PRICE',
    onSalePrice: row.onSalePrice ? Number(row.onSalePrice) : null,
    seq: index,
  }));

  // 4. 构建赠品列表
  const presentList = form.getTableRecords('presentList').map<CombinedSalePresent>((row, index) => ({
    goodsId: Number(row.goodsId),
    currUnitId: String(row.currUnitId || 'BASE'),
    currUnitName: row.currUnitName ? String(row.currUnitName) : undefined,
    quantity: isPresentFixed ? String(Number(row.quantity) || 1) : (Number(row.quantity) || 1),
    mustSelect: isPresentFixed ? null : (row.mustSelect === true || row.mustSelect === 'true'),
    promotionPriceType: 'SYSTEM_PRICE',
    businessAttrId: 8,
    seq: index,
  }));

  // 5. 保存并上架
  await erpSaveCombinedSaleAndShelf(promotionId!, rule, goodsList, presentList);

  log.info(`组合搭赠创建成功: promotionId=${promotionId}, no=${promotionNo}`);

  return {
    formData: {
      promotionId,
      promotionNo,
    },
  };
}

/**
 * 线下限时特价：审批通过后回调
 */
export async function onApprovedPromotionSpecialOffline(
  _instance: OaInstanceRow,
  form: FormAccessor
): Promise<CallbackResult> {
  const rawData = form.getRawData();
  const { startDate, endDate } = extractDates(rawData);
  const clientConfig = buildClientConfig(rawData);

  // 1. 创建促销活动（幂等：重试时复用已创建的 promotionId）
  let promotionId = form.getNumber('promotionId');
  let promotionNo = form.getString('promotionNo');

  if (!promotionId) {
    const promotion = await erpCreatePromotion(
      'specialOffer',
      form.getString('name') ?? '',
      startDate,
      endDate,
      clientConfig,
      'GOOD'
    );
    promotionId = promotion.promotionId;
    promotionNo = promotion.promotionNo;
  }

  // 2. 构建商品列表
  const goodsList = form.getTableRecords('goodsList').map<SpecialOfferGoods>(row => {
    const item: SpecialOfferGoods = {
      goodsId: Number(row.goodsId),
      currUnitId: String(row.currUnitId || 'BASE'),
      currUnitName: String(row.currUnitName || ''),
      onSalePrice: Number(row.onSalePrice) || 0,
    };
    if (row.qualifiedNum) item.qualifiedNum = Number(row.qualifiedNum);
    if (row.onSalePriceMin) item.onSalePriceMin = Number(row.onSalePriceMin);
    if (row.activeStock) item.activeStock = String(row.activeStock);

    // 临期特价
    const goodsExts = row.goodsExts as Array<{ nearExpiryDays: number; nearExpiryPrice: string }> | undefined;
    if (goodsExts && goodsExts.length > 0) {
      item.goodsExts = goodsExts
        .filter(ext => ext.nearExpiryDays && ext.nearExpiryPrice)
        .map(ext => ({
          nearExpiryDays: Number(ext.nearExpiryDays),
          nearExpiryPrice: String(ext.nearExpiryPrice),
        }));
    }

    return item;
  });

  // 3. 保存并上架
  await erpSaveSpecialOfferAndShelf(promotionId!, goodsList);

  log.info(`限时特价创建成功: promotionId=${promotionId}, no=${promotionNo}`);

  return {
    formData: {
      promotionId,
      promotionNo,
    },
  };
}

/**
 * 线下满赠：审批通过后回调
 */
export async function onApprovedPromotionFullGiftOffline(
  _instance: OaInstanceRow,
  form: FormAccessor
): Promise<CallbackResult> {
  const rawData = form.getRawData();
  const { startDate, endDate } = extractDates(rawData);
  const clientConfig = buildClientConfig(rawData);

  // 1. 创建促销活动（幂等：重试时复用已创建的 promotionId）
  let promotionId = form.getNumber('promotionId');
  let promotionNo = form.getString('promotionNo');

  if (!promotionId) {
    const promotion = await erpCreatePromotion(
      'reachGive',
      form.getString('name') ?? '',
      startDate,
      endDate,
      clientConfig
    );
    promotionId = promotion.promotionId;
    promotionNo = promotion.promotionNo;
  }

  // 2. 构建规则
  const onSaleType = form.getString('onSaleType') ?? 'loop';
  const rule: FullGiftRule = {
    fullGiftType: 'count',
    onSaleType: onSaleType as 'loop' | 'step',
    loopRule: null,
    stepRuleList: undefined,
  };

  if (onSaleType === 'loop') {
    rule.loopRule = {
      countLatch: form.getNumber('loopCountLatch') ?? 1,
      presentType: form.getNumber('loopPresentType') ?? 1,
    };
    if (form.getNumber('loopPresentType') === 0 && form.getRaw('loopGiveCount')) {
      rule.loopRule.giveCount = String(form.getRaw('loopGiveCount'));
    }
  } else {
    const stepRules = form.getTableRecords('stepRules');
    rule.stepRuleList = stepRules.map((row, idx) => ({
      seq: idx + 1,
      countLatch: Number(row.countLatch) || 1,
      giveType: Number(row.giveType) || 1,
      giveCount: row.giveCount ? Number(row.giveCount) : null,
    }));
  }

  // 3. 构建主品列表
  const mainGoodsList = form.getTableRecords('mainGoodsList').map<FullGiftMainGoods>(row => ({
    goodsId: Number(row.goodsId),
    currUnitId: row.currUnitId ? String(row.currUnitId) : undefined,
    currUnitName: row.currUnitName ? String(row.currUnitName) : undefined,
    startingQuantity: row.startingQuantity ? Number(row.startingQuantity) : undefined,
    purchaseLimits: row.purchaseLimits ? Number(row.purchaseLimits) : undefined,
    activeStock: row.activeStock ? Number(row.activeStock) : undefined,
    mustSelect: row.mustSelect === true || row.mustSelect === 'true',
    onSalePrice: row.onSalePrice ? Number(row.onSalePrice) : undefined,
  }));

  // 4. 构建赠品列表
  let presentList: FullGiftLoopPresent[] | FullGiftStepPresent[];

  if (onSaleType === 'loop') {
    const loopPresents = form.getTableRecords('loopPresents');
    presentList = loopPresents.map<FullGiftLoopPresent>(row => ({
      goodsId: Number(row.goodsId),
      currUnitId: row.currUnitId ? String(row.currUnitId) : undefined,
      currUnitName: row.currUnitName ? String(row.currUnitName) : undefined,
      quantity: Number(row.quantity) || 1,
      mustSelect: row.mustSelect === true || row.mustSelect === 'true',
    }));
  } else {
    const stepPresents = form.getTableRecords('stepPresents');
    presentList = stepPresents.map<FullGiftStepPresent>(row => ({
      goodsId: Number(row.goodsId),
      currUnitId: row.currUnitId ? String(row.currUnitId) : undefined,
      currUnitName: row.currUnitName ? String(row.currUnitName) : undefined,
      quantity: Number(row.quantity) || 1,
      seq: Number(row.seq) || 1,
      mustSelect: row.mustSelect === true || row.mustSelect === 'true',
    }));
  }

  // 5. 保存并上架
  await erpSaveFullGiftAndShelf(promotionId!, rule, mainGoodsList, presentList);

  log.info(`满赠创建成功: promotionId=${promotionId}, no=${promotionNo}`);

  return {
    formData: {
      promotionId,
      promotionNo,
    },
  };
}
