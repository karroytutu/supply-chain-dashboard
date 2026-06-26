/**
 * ERP 促销活动服务
 * 封装舟谱 ERP 促销活动的创建和上架 API
 * @module services/erp-client/erp-promotion.service
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('ErpPromotion');

import { erpPost, erpGet, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';

// =====================================================
// 类型定义
// =====================================================

/** 促销类型枚举 */
export type PromotionType = 'combinedSale' | 'specialOffer' | 'reachGive';

/** 参与客户配置 */
export interface PromotionClientConfig {
  issueRange: number;
  clientRule?: { areaList?: number[] } | null;
  clientIdList?: number[] | null;
}

/** 创建促销响应 */
export interface CreatePromotionResult {
  promotionId: number;
  promotionNo: string;
}

/** 组合搭赠规则 */
export interface CombinedSaleRule {
  limitCountPerClient: string | number;
  totalCount?: string | number;
  goodsType: number;
  goodsCount?: string | number | null;
  presentType: number;
  giftCount?: string | number | null;
}

/** 组合搭赠主品 */
export interface CombinedSaleGoods {
  goodsId: number;
  currUnitId: string;
  currUnitName?: string;
  quantity: string | number;
  mustSelect?: boolean | null;
  promotionPriceType?: string;
  onSalePrice?: number | null;
  seq?: number;
}

/** 组合搭赠赠品 */
export interface CombinedSalePresent {
  goodsId: number;
  currUnitId: string;
  currUnitName?: string;
  quantity: string | number;
  mustSelect?: boolean | null;
  businessAttrId?: number;
  seq?: number;
}

/** 限时特价商品 */
export interface SpecialOfferGoods {
  goodsId: number;
  currUnitId: string;
  currUnitName?: string;
  qualifiedNum?: number;
  onSalePrice: number;
  onSalePriceMin?: number;
  activeStock?: string;
  goodsExts?: Array<{
    nearExpiryDays: number;
    nearExpiryPrice: string;
  }>;
}

/** 满赠规则（循环） */
export interface FullGiftLoopRule {
  countLatch: number;
  presentType: number;
  giveCount?: string;
}

/** 满赠规则（阶梯） */
export interface FullGiftStepRule {
  seq: number;
  countLatch: number;
  giveType: number;
  giveCount?: number | null;
}

/** 满赠规则 */
export interface FullGiftRule {
  fullGiftType: string;
  onSaleType: 'loop' | 'step';
  loopRule?: FullGiftLoopRule | null;
  stepRuleList?: FullGiftStepRule[];
}

/** 满赠主品 */
export interface FullGiftMainGoods {
  goodsId: number;
  currUnitId?: string;
  currUnitName?: string;
  startingQuantity?: number;
  purchaseLimits?: number;
  activeStock?: number;
  mustSelect?: boolean;
  onSalePrice?: number;
}

/** 满赠赠品（循环） */
export interface FullGiftLoopPresent {
  goodsId: number;
  currUnitId?: string;
  currUnitName?: string;
  quantity: number;
  mustSelect?: boolean;
}

/** 满赠赠品（阶梯） */
export interface FullGiftStepPresent {
  goodsId: number;
  currUnitId?: string;
  currUnitName?: string;
  quantity: number;
  seq: number;
  mustSelect?: boolean;
}

// =====================================================
// API 调用
// =====================================================

/**
 * 创建促销活动（保存基本信息）
 * 三种类型共用
 */
export async function erpCreatePromotion(
  promotionType: PromotionType,
  name: string,
  startDate: string,
  endDate: string,
  relatedClient: PromotionClientConfig,
  qualityTag?: string
): Promise<CreatePromotionResult> {
  const { cid, uid } = getErpDefaults();

  log.info(`创建促销活动: type=${promotionType}, name=${name}`);

  const result = await erpPost<{ code: number; data: unknown }>(
    '/quantum/promotion/doc/save-or-update-promotion',
    {
      name,
      remark: '',
      saleRemark: '',
      operateType: 'add',
      startDate,
      endDate,
      promotionType,
      relatedClient,
      qualityTag: qualityTag || 'ALL',
      cid,
      uid,
    },
    { businessType: 'promotion_create', pathPrefix: '/' }
  );

  // 响应 data 直接是 promotionId 数字（如 10003314）
  const raw = extractErpData(result);
  const promotionId = typeof raw === 'number' ? raw : (raw as Record<string, unknown>)?.promotionId as number;
  if (!promotionId) {
    throw new Error('创建促销活动失败：未返回 promotionId');
  }

  // 创建接口只返回 promotionId 数字，需要查询详情获取促销单号
  let promotionNo = '';
  try {
    const detail = await erpGet<{ code: number; data: { promotionNo?: string } }>(
      '/quantum/promotion/doc/query-promotion-detail',
      { promotionId, cid, uid },
      { businessType: 'promotion_query', pathPrefix: '/' }
    );
    promotionNo = extractErpData<{ promotionNo?: string }>(detail)?.promotionNo || '';
  } catch (e) {
    log.warn(`查询促销单号失败(promotionId=${promotionId}):`, e instanceof Error ? e.message : e);
  }

  log.info(`促销活动创建成功: id=${promotionId}, no=${promotionNo}`);
  return { promotionId, promotionNo };
}

/**
 * 组合搭赠：保存商品并上架
 */
export async function erpSaveCombinedSaleAndShelf(
  promotionId: number,
  rule: CombinedSaleRule,
  goodsList: CombinedSaleGoods[],
  presentList: CombinedSalePresent[]
): Promise<void> {
  const { cid, uid } = getErpDefaults();

  log.info(`组合搭赠保存并上架: promotionId=${promotionId}, 主品${goodsList.length}个, 赠品${presentList.length}个`);

  await erpPost(
    '/quantum/promotion/doc/update-goods-for-combined-sale',
    {
      promotionId,
      shelvesState: 1,
      rule,
      goodsList: goodsList.map(g => ({
        ...g,
        promotionPriceType: g.promotionPriceType || 'FIXED_PRICE',
      })),
      presentList,
      cid,
      uid,
    },
    { businessType: 'promotion_combined_sale', businessId: promotionId, pathPrefix: '/' }
  );

  log.info(`组合搭赠保存并上架成功: promotionId=${promotionId}`);
}

/**
 * 限时特价：保存商品并上架
 */
export async function erpSaveSpecialOfferAndShelf(
  promotionId: number,
  goodsList: SpecialOfferGoods[]
): Promise<void> {
  const { cid, uid } = getErpDefaults();

  log.info(`限时特价保存并上架: promotionId=${promotionId}, 商品${goodsList.length}个`);

  await erpPost(
    '/quantum/promotion/doc/update-goods-for-special-offer',
    {
      promotionId,
      shelvesState: 1,
      goodsList,
      cid,
      uid,
    },
    { businessType: 'promotion_special_offer', businessId: promotionId, pathPrefix: '/' }
  );

  log.info(`限时特价保存并上架成功: promotionId=${promotionId}`);
}

/**
 * 满赠：保存商品并上架（支持循环和阶梯两种模式）
 */
export async function erpSaveFullGiftAndShelf(
  promotionId: number,
  rule: FullGiftRule,
  mainGoodsList: FullGiftMainGoods[],
  presentList: FullGiftLoopPresent[] | FullGiftStepPresent[]
): Promise<void> {
  const { cid, uid } = getErpDefaults();

  log.info(`满赠保存并上架: promotionId=${promotionId}, mode=${rule.onSaleType}, 主品${mainGoodsList.length}个`);

  const body: Record<string, unknown> = {
    promotionId,
    shelvesState: 1,
    rule,
    mainGoodsList,
    cid,
    uid,
  };

  // 根据模式设置赠品列表字段名
  if (rule.onSaleType === 'loop') {
    body.loopPresentList = presentList;
  } else {
    body.stepPresentList = presentList;
  }

  await erpPost(
    '/quantum/promotion/doc/update-goods-for-full-gift',
    body,
    { businessType: 'promotion_full_gift', businessId: promotionId, pathPrefix: '/' }
  );

  log.info(`满赠保存并上架成功: promotionId=${promotionId}`);
}
