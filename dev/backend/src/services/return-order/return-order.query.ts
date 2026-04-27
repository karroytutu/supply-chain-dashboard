/**
 * 退货单查询服务
 * 薄包装层，委托给 Repository 执行数据访问
 */

import * as repo from './return-order.repository';
import { toReturnOrderDTO, toReturnActionDTO, toReturnOrderStatsDTO } from './return-order.mapper';
import type {
  ReturnOrder,
  ReturnOrderQueryParams,
  ReturnOrderStats,
  ReturnOrderListResult,
  ReturnAction,
} from './return-order.types';

/**
 * 获取退货单列表
 */
export async function getReturnOrders(
  params: ReturnOrderQueryParams
): Promise<ReturnOrderListResult> {
  const result = await repo.getOrders(params);
  return {
    ...result,
    data: result.data.map(toReturnOrderDTO),
  };
}

/**
 * 获取退货单详情
 */
export async function getReturnOrderById(id: number): Promise<ReturnOrder | null> {
  const row = await repo.getOrderById(id);
  if (!row) return null;
  return toReturnOrderDTO(row);
}

/**
 * 获取退货单统计
 */
export async function getReturnOrderStats(): Promise<ReturnOrderStats> {
  const row = await repo.getStats();
  return toReturnOrderStatsDTO(row);
}

/**
 * 获取待填写ERP退货单的列表
 */
export async function getPendingErpOrders(): Promise<ReturnOrder[]> {
  const rows = await repo.getPendingErpOrders();
  // 待ERP列表结构简化，手动映射
  return rows.map((row: any) => ({
    id: row.id,
    returnNo: row.return_no,
    goodsId: row.goods_id,
    goodsName: row.goods_name,
    quantity: parseFloat(row.quantity as any) || 0,
    unit: row.unit,
    batchDate: row.batch_date,
    returnDate: row.return_date,
    expireDate: row.expire_date,
    shelfLife: row.shelf_life,
    daysToExpire: row.days_to_expire,
    daysToExpireAtReturn: row.days_to_expire_at_return,
    status: row.status,
    sourceBillNo: row.source_bill_no,
    consumerName: row.consumer_name,
    marketingManager: row.marketing_manager,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    erpReturnNo: null,
    erpFilledBy: null,
    erpFilledAt: null,
    warehouseExecutedBy: null,
    warehouseExecutedAt: null,
    warehouseReturnQuantity: null,
    warehouseEvidenceUrl: null,
    warehouseComment: null,
    marketingCompletedBy: null,
    marketingCompletedAt: null,
    marketingComment: null,
    ruleId: null,
    currentStock: null,
    purchasePrice: null,
    ruleConfirmedAt: null,
    ruleConfirmedBy: null,
  }));
}

/**
 * 获取退货单操作记录
 */
export async function getReturnOrderActions(orderId: number): Promise<ReturnAction[]> {
  const rows = await repo.getActions(orderId);
  return rows.map(toReturnActionDTO);
}
