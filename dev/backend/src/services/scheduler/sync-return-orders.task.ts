/**
 * 退货数据同步定时任务
 * 每天08:30从ERP同步昨天的退货数据
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('Scheduler');

import { appQuery } from '../../db/appPool';
import { beijingDateCompact } from '../../utils/beijingTime';
import { getProductByName } from '../erp-client/erp-product.service';
import { getCostPriceByNameMap } from '../erp-client/erp-inventory.service';
import { fetchReturnAcceptances } from '../erp-client/erp-return-acceptance.service';
import { getSalesDetailByOriginStr } from '../erp-client/erp-sales-detail.service';
import { searchErpCustomers } from '../erp-client/erp-customer.service';
import { getExpiringThreshold } from '../../utils/constants';
import { checkGoodsReturnRule } from '../goods-return-rules/goods-return-rules.service';
import {
  createReturnOrder,
  autoCompleteMarketingSale,
} from '../return-order/return-order.mutation';
import { sendDailyNewReturnReminder } from '../return-order/return-order-notify';
import type { ReturnOrder } from '../return-order/return-order.types';

/**
 * 云仓退货验收明细记录
 */
interface ReturnAcceptanceRecord {
  sourceBillNo: string;
  goodsId: string;
  goodsName: string;
  unitName: string;
  unfrozenIncreasedQuantity: number;
  productionDate: Date;
  createTime: Date;
}

/**
 * 商品档案信息
 */
interface GoodsInfo {
  shelfLife: number;
}

/**
 * 销售结算明细记录
 */
interface SalesSettlementRecord {
  consumerName: string;
}

/**
 * 客户档案记录
 */
interface CustomerRecord {
  consumerManagerName: string;
}

/**
 * 同步退货数据
 * 每天08:30执行，同步昨天新增的退货记录
 */
export async function syncReturnOrders(): Promise<{
  totalProcessed: number;
  expiringCount: number;
  createdCount: number;
  skippedCount: number;
}> {
  log.info('开始同步退货数据...');
  const startTime = Date.now();

  // 获取昨天的时间范围
  const yesterday = getYesterdayRange();
  log.info(`同步时间范围: ${yesterday.start} ~ ${yesterday.end}`);

  // 1. 查询昨天新增的退货验收明细
  const returnRecords = await queryReturnAcceptanceRecords(yesterday.start, yesterday.end);
  log.info(`查询到 ${returnRecords.length} 条退货记录`);

  let expiringCount = 0;
  let createdCount = 0;
  let skippedCount = 0;

  for (const record of returnRecords) {
    try {
      // 2. 幂等性检查：检查退货单号是否已存在（与数据库唯一约束一致）
      const exists = await checkReturnOrderExists(
        record.sourceBillNo,
        record.goodsId,
        record.unitName
      );
      if (exists) {
        log.info(`跳过已存在的记录: ${record.sourceBillNo}, 商品: ${record.goodsName}`);
        skippedCount++;
        continue;
      }

      // 3. 查询商品档案获取保质期（使用商品名称匹配）
      const goodsInfo = await queryGoodsInfo(record.goodsName);
      if (!goodsInfo) {
        log.warn(`未找到商品档案: ${record.goodsName}`);
        continue;
      }

      // 4. 计算临期阈值并判断是否临期
      const threshold = getExpiringThreshold(goodsInfo.shelfLife);
      const daysToExpire = calculateDaysToExpire(record.productionDate, goodsInfo.shelfLife);

      // 仅处理临期商品
      if (daysToExpire > threshold) {
        log.info(
          `商品非临期，跳过: ${record.goodsName}, 剩余${daysToExpire}天，阈值${threshold}天`
        );
        continue;
      }

      expiringCount++;
      log.info(`发现临期商品: ${record.goodsName}, 剩余${daysToExpire}天`);

      // 5. 查询商品退货规则
      const rule = await checkGoodsReturnRule(record.goodsId);

      // 6. 确定退货单状态
      let status: string;
      if (rule) {
        status = rule.canReturnToSupplier ? 'pending_erp_fill' : 'pending_marketing_sale';
      } else {
        status = 'pending_confirm';
      }

      // 7. 关联责任营销师
      const marketingManager = await queryMarketingManager(record.sourceBillNo);

      // 8. 获取商品进价（用于考核计算）
      const purchasePrice = await queryPurchasePrice(record.goodsName);

      // 9. 生成退货单号
      const returnNo = generateReturnNo();

      // 10. 创建退货单（ON CONFLICT 时返回 null，保证幂等）
      const created = await createReturnOrder({
        returnNo,
        goodsId: record.goodsId,
        goodsName: record.goodsName,
        quantity: record.unfrozenIncreasedQuantity,
        unit: record.unitName,
        batchDate: record.productionDate,
        returnDate: record.createTime,
        expireDate: calculateExpireDate(record.productionDate, goodsInfo.shelfLife),
        shelfLife: goodsInfo.shelfLife,
        daysToExpire,
        sourceBillNo: record.sourceBillNo,
        consumerName: (await queryConsumerName(record.sourceBillNo)) || undefined,
        marketingManager: marketingManager || undefined,
        status: status as any,
        purchasePrice: purchasePrice || undefined,
      });

      if (!created) {
        log.info(`退货单已存在，跳过: ${record.sourceBillNo}, 商品: ${record.goodsName}`);
        skippedCount++;
        continue;
      }

      createdCount++;
      log.info(`创建退货单成功: ${returnNo}, 状态: ${status}`);
    } catch (error) {
      log.error(`处理记录失败: ${record.sourceBillNo}`, error);
    }
  }

  const duration = Date.now() - startTime;
  log.info(
    `同步完成，总记录: ${returnRecords.length}, 临期: ${expiringCount}, 创建: ${createdCount}, 跳过: ${skippedCount}, 耗时: ${duration}ms`
  );

  // 自动检查销售完成情况
  try {
    const autoCompleteResult = await autoCompleteMarketingSale();
    log.info(
      `销售完成检查: 检查 ${autoCompleteResult.checkedCount} 条, 完成 ${autoCompleteResult.completedCount} 条`
    );
  } catch (autoError) {
    log.error('自动销售完成检查失败:', autoError);
  }

  return {
    totalProcessed: returnRecords.length,
    expiringCount,
    createdCount,
    skippedCount,
  };
}

/**
 * 获取昨天的时间范围
 */
function getYesterdayRange(): { start: string; end: string } {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const start = new Date(yesterday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(yesterday);
  end.setHours(23, 59, 59, 999);

  return {
    start: formatDateTime(start),
    end: formatDateTime(end),
  };
}

/**
 * 格式化日期时间为字符串
 */
function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 查询云仓退货验收明细（通过 WMS API）
 */
async function queryReturnAcceptanceRecords(
  startTime: string,
  endTime: string
): Promise<ReturnAcceptanceRecord[]> {
  const dateStart = startTime.slice(0, 10);
  const dateEnd = endTime.slice(0, 10);
  const records = await fetchReturnAcceptances(dateStart, dateEnd);

  return records.map(r => ({
    sourceBillNo: r.sourceBillNo,
    goodsId: String(r.goodsId),
    goodsName: r.goodsName,
    unitName: r.unitName,
    unfrozenIncreasedQuantity: r.unfrozenIncreasedQuantity,
    productionDate: new Date(r.productionDate),
    createTime: new Date(r.createTime),
  }));
}

/**
 * 查询商品档案信息（通过 ERP API）
 */
async function queryGoodsInfo(goodsName: string): Promise<GoodsInfo | null> {
  const product = await getProductByName(goodsName);
  if (!product) return null;
  return { shelfLife: product.shelfLife || 0 };
}

/**
 * 检查退货单是否已存在
 * 基于 sourceBillNo、goodsId 和 unit 进行幂等性检查（与数据库唯一约束一致）
 */
async function checkReturnOrderExists(
  sourceBillNo: string,
  goodsId: string,
  unit: string
): Promise<boolean> {
  const result = await appQuery<{ count: number }>(
    `SELECT COUNT(*) as count FROM expiring_return_orders 
     WHERE source_bill_no = $1 AND goods_id = $2 AND unit = $3`,
    [sourceBillNo, goodsId, unit]
  );

  return parseInt(result.rows[0].count as any) > 0;
}

/**
 * 查询责任营销师（通过 ERP API）
 */
async function queryMarketingManager(sourceBillNo: string): Promise<string | null> {
  try {
    const salesDetail = await getSalesDetailByOriginStr(sourceBillNo);
    if (!salesDetail) {
      log.warn(`未找到销售结算记录: ${sourceBillNo}`);
      return null;
    }

    const consumerName = salesDetail.consumerName;
    const customers = await searchErpCustomers(consumerName);
    const matched = customers.find(c => c.name === consumerName);
    if (!matched) {
      log.warn(`未找到客户档案: ${consumerName}`);
      return null;
    }

    return (matched as any).consumerManagerName || null;
  } catch (error) {
    log.error(`查询责任营销师失败: ${sourceBillNo}`, error);
    return null;
  }
}

/**
 * 查询客户名称（通过 ERP API）
 */
async function queryConsumerName(sourceBillNo: string): Promise<string | null> {
  try {
    const salesDetail = await getSalesDetailByOriginStr(sourceBillNo);
    return salesDetail?.consumerName || null;
  } catch (error) {
    log.error(`查询客户名称失败: ${sourceBillNo}`, error);
    return null;
  }
}

/**
 * 计算剩余保质期天数
 * 返回正数表示剩余天数，负数表示已过期天数，0 表示当天过期
 */
function calculateDaysToExpire(batchDate: Date, shelfLife: number): number {
  const batch = new Date(batchDate);
  const expireDate = new Date(batch);
  expireDate.setDate(expireDate.getDate() + shelfLife);

  const now = new Date();
  now.setHours(0, 0, 0, 0); // 使用日期比较，忽略时间部分
  const diffTime = expireDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * 计算过期日期
 */
function calculateExpireDate(batchDate: Date, shelfLife: number): Date {
  const batch = new Date(batchDate);
  const expireDate = new Date(batch);
  expireDate.setDate(expireDate.getDate() + shelfLife);
  return expireDate;
}

/**
 * 生成退货单号
 * 格式: RET + YYYYMMDD + 4位序号
 */
function generateReturnNo(): string {
  const dateStr = beijingDateCompact();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `RET${dateStr}${random}`;
}

/**
 * 发送新增临期退货提醒
 * 在同步完成后调用，发送今天新增的待确认退货单提醒
 */
export async function sendNewReturnReminder(): Promise<void> {
  try {
    log.info('准备发送新增临期退货提醒...');

    // 查询今天新增的待确认退货单
    const today = getTodayRange();
    const result = await appQuery<ReturnOrder>(
      `SELECT 
        id, return_no as "returnNo", goods_id as "goodsId", goods_name as "goodsName",
        quantity, unit, batch_date as "batchDate", return_date as "returnDate",
        expire_date as "expireDate", shelf_life as "shelfLife", days_to_expire as "daysToExpire",
        status, source_bill_no as "sourceBillNo", consumer_name as "consumerName",
        marketing_manager as "marketingManager", erp_return_no as "erpReturnNo",
        created_at as "createdAt", updated_at as "updatedAt"
       FROM expiring_return_orders 
       WHERE status = 'pending_confirm' 
         AND created_at >= $1 AND created_at <= $2
       ORDER BY created_at DESC`,
      [today.start, today.end]
    );

    const orders = result.rows;
    log.info(`查询到 ${orders.length} 条待确认退货单`);

    if (orders.length === 0) {
      log.info('无新增待确认退货单，跳过提醒');
      return;
    }

    // 发送批量提醒
    await sendDailyNewReturnReminder(orders);
    log.info('新增临期退货提醒发送完成');
  } catch (error) {
    log.error('发送新增临期退货提醒失败:', error);
  }
}

/**
 * 获取今天的时间范围
 */
function getTodayRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return {
    start: formatDateTime(start),
    end: formatDateTime(end),
  };
}

/**
 * 查询商品平均进价
 * 从实时库存表获取加权平均进价
 */
async function queryPurchasePrice(goodsName: string): Promise<number | null> {
  try {
    const costMap = await getCostPriceByNameMap();
    const price = costMap.get(goodsName);
    return price && price > 0 ? price : null;
  } catch (error) {
    log.error(`查询商品进价失败: ${goodsName}`, error);
    return null;
  }
}
