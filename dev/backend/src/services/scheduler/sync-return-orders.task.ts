/**
 * 退货数据同步定时任务
 * 每天08:30从ERP同步昨天的退货数据
 */

import { query } from '../../db/pool';
import { appQuery } from '../../db/appPool';
import { getExpiringThreshold } from '../../utils/constants';
import { checkGoodsReturnRule } from '../goods-return-rules/goods-return-rules.service';
import { createReturnOrder } from '../return-order/return-order.mutation';
import type { CreateReturnOrderParams } from '../return-order/return-order.types';

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
  console.log('[SyncReturnOrders] 开始同步退货数据...');
  const startTime = Date.now();

  // 获取昨天的时间范围
  const yesterday = getYesterdayRange();
  console.log(`[SyncReturnOrders] 同步时间范围: ${yesterday.start} ~ ${yesterday.end}`);

  // 1. 查询昨天新增的退货验收明细
  const returnRecords = await queryReturnAcceptanceRecords(yesterday.start, yesterday.end);
  console.log(`[SyncReturnOrders] 查询到 ${returnRecords.length} 条退货记录`);

  let expiringCount = 0;
  let createdCount = 0;
  let skippedCount = 0;

  for (const record of returnRecords) {
    try {
      // 2. 幂等性检查：检查退货单号是否已存在
      const exists = await checkReturnOrderExists(record.sourceBillNo, record.goodsId);
      if (exists) {
        console.log(`[SyncReturnOrders] 跳过已存在的记录: ${record.sourceBillNo}, 商品: ${record.goodsName}`);
        skippedCount++;
        continue;
      }

      // 3. 查询商品档案获取保质期
      const goodsInfo = await queryGoodsInfo(record.goodsId);
      if (!goodsInfo) {
        console.warn(`[SyncReturnOrders] 未找到商品档案: ${record.goodsId}`);
        continue;
      }

      // 4. 计算临期阈值并判断是否临期
      const threshold = getExpiringThreshold(goodsInfo.shelfLife);
      const daysToExpire = calculateDaysToExpire(record.productionDate, goodsInfo.shelfLife);

      // 仅处理临期商品
      if (daysToExpire > threshold) {
        console.log(`[SyncReturnOrders] 商品非临期，跳过: ${record.goodsName}, 剩余${daysToExpire}天，阈值${threshold}天`);
        continue;
      }

      expiringCount++;
      console.log(`[SyncReturnOrders] 发现临期商品: ${record.goodsName}, 剩余${daysToExpire}天`);

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

      // 8. 生成退货单号
      const returnNo = generateReturnNo();

      // 9. 创建退货单
      await createReturnOrder({
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
      });

      createdCount++;
      console.log(`[SyncReturnOrders] 创建退货单成功: ${returnNo}, 状态: ${status}`);
    } catch (error) {
      console.error(`[SyncReturnOrders] 处理记录失败: ${record.sourceBillNo}`, error);
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[SyncReturnOrders] 同步完成，总记录: ${returnRecords.length}, 临期: ${expiringCount}, 创建: ${createdCount}, 跳过: ${skippedCount}, 耗时: ${duration}ms`);

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
 * 查询云仓退货验收明细
 * 查询昨天新增的记录
 */
async function queryReturnAcceptanceRecords(
  startTime: string,
  endTime: string
): Promise<ReturnAcceptanceRecord[]> {
  const result = await query<ReturnAcceptanceRecord>(
    `SELECT 
      "sourceBillNo",
      "goodsId",
      "goodsName",
      "unitName",
      "unfrozenIncreasedQuantity",
      "productionDate",
      "createTime"
    FROM "云仓退货验收明细"
    WHERE "createTime" >= $1 AND "createTime" <= $2
    ORDER BY "createTime" DESC`,
    [startTime, endTime]
  );

  return result.rows;
}

/**
 * 查询商品档案信息
 */
async function queryGoodsInfo(goodsId: string): Promise<GoodsInfo | null> {
  const result = await query<GoodsInfo>(
    `SELECT "shelfLife" FROM "商品档案" WHERE "goodsId" = $1 LIMIT 1`,
    [goodsId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    shelfLife: result.rows[0].shelfLife,
  };
}

/**
 * 检查退货单是否已存在
 * 基于 sourceBillNo 和 goodsId 进行幂等性检查
 */
async function checkReturnOrderExists(
  sourceBillNo: string,
  goodsId: string
): Promise<boolean> {
  const result = await appQuery<{ count: number }>(
    `SELECT COUNT(*) as count FROM expiring_return_orders 
     WHERE source_bill_no = $1 AND goods_id = $2`,
    [sourceBillNo, goodsId]
  );

  return parseInt(result.rows[0].count as any) > 0;
}

/**
 * 查询责任营销师
 * 通过销售结算明细表和客户档案表关联
 */
async function queryMarketingManager(sourceBillNo: string): Promise<string | null> {
  try {
    // 1. 从销售结算明细表获取客户名称
    const settlementResult = await query<SalesSettlementRecord>(
      `SELECT "consumerName" FROM "销售结算明细表" WHERE "originStr" = $1 LIMIT 1`,
      [sourceBillNo]
    );

    if (settlementResult.rows.length === 0) {
      console.warn(`[SyncReturnOrders] 未找到销售结算记录: ${sourceBillNo}`);
      return null;
    }

    const consumerName = settlementResult.rows[0].consumerName;

    // 2. 从客户档案表获取责任营销师
    const customerResult = await query<CustomerRecord>(
      `SELECT "consumerManagerName" FROM "客户档案表" WHERE "name" = $1 LIMIT 1`,
      [consumerName]
    );

    if (customerResult.rows.length === 0) {
      console.warn(`[SyncReturnOrders] 未找到客户档案: ${consumerName}`);
      return null;
    }

    return customerResult.rows[0].consumerManagerName;
  } catch (error) {
    console.error(`[SyncReturnOrders] 查询责任营销师失败: ${sourceBillNo}`, error);
    return null;
  }
}

/**
 * 查询客户名称
 */
async function queryConsumerName(sourceBillNo: string): Promise<string | null> {
  try {
    const result = await query<{ consumerName: string }>(
      `SELECT "consumerName" FROM "销售结算明细表" WHERE "originStr" = $1 LIMIT 1`,
      [sourceBillNo]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].consumerName;
  } catch (error) {
    console.error(`[SyncReturnOrders] 查询客户名称失败: ${sourceBillNo}`, error);
    return null;
  }
}

/**
 * 计算剩余保质期天数
 */
function calculateDaysToExpire(batchDate: Date, shelfLife: number): number {
  const batch = new Date(batchDate);
  const expireDate = new Date(batch);
  expireDate.setDate(expireDate.getDate() + shelfLife);

  const now = new Date();
  const diffTime = expireDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
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
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `RET${dateStr}${random}`;
}
