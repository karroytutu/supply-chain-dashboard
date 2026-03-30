/**
 * 退货单工具函数
 */

import { appQuery } from '../../db/appPool';
import type { ReturnOrder, ReturnOrderStatus, ReturnAction, ReturnActionType } from './return-order.types';

/** 数据库行类型 */
export interface ReturnOrderRow {
  id: number;
  return_no: string;
  goods_id: string;
  goods_name: string;
  quantity: number;
  unit: string | null;
  batch_date: Date | null;
  return_date: Date | null;
  expire_date: Date | null;
  shelf_life: number | null;
  days_to_expire: number | null;
  days_to_expire_at_return: number | null;  // 退货时剩余保质期
  calculated_days_to_expire?: number | null;  // 动态计算的当前剩余保质期
  status: ReturnOrderStatus;
  source_bill_no: string | null;
  consumer_name: string | null;
  marketing_manager: string | null;
  erp_return_no: string | null;
  erp_filled_by: number | null;
  erp_filled_at: Date | null;
  warehouse_executed_by: number | null;
  warehouse_executed_at: Date | null;
  warehouse_return_quantity: number | null;
  warehouse_comment: string | null;
  marketing_completed_by: number | null;
  marketing_completed_at: Date | null;
  marketing_comment: string | null;
  rule_id: number | null;
  created_at: Date;
  updated_at: Date;
  erp_filler_name?: string | null;
  warehouse_executor_name?: string | null;
  marketing_completer_name?: string | null;
}

/**
 * 将数据库行映射为 ReturnOrder 对象
 */
export function mapRowToReturnOrder(row: ReturnOrderRow): ReturnOrder {
  return {
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
    daysToExpire: row.calculated_days_to_expire ?? row.days_to_expire,
    daysToExpireAtReturn: row.days_to_expire_at_return,
    status: row.status,
    sourceBillNo: row.source_bill_no,
    consumerName: row.consumer_name,
    marketingManager: row.marketing_manager,
    erpReturnNo: row.erp_return_no,
    erpFilledBy: row.erp_filled_by,
    erpFilledAt: row.erp_filled_at,
    warehouseExecutedBy: row.warehouse_executed_by,
    warehouseExecutedAt: row.warehouse_executed_at,
    warehouseReturnQuantity: row.warehouse_return_quantity
      ? parseFloat(row.warehouse_return_quantity as any)
      : null,
    warehouseComment: row.warehouse_comment,
    marketingCompletedBy: row.marketing_completed_by,
    marketingCompletedAt: row.marketing_completed_at,
    marketingComment: row.marketing_comment,
    ruleId: row.rule_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    erpFillerName: row.erp_filler_name || undefined,
    warehouseExecutorName: row.warehouse_executor_name || undefined,
    marketingCompleterName: row.marketing_completer_name || undefined,
  };
}

/**
 * 记录操作日志
 */
export async function recordAction(
  orderId: number,
  actionType: ReturnActionType,
  operatorId: number | null,
  operatorName: string,
  comment?: string,
  details?: Record<string, any>
): Promise<void> {
  await appQuery(
    `INSERT INTO expiring_return_actions
     (order_id, action_type, operator_id, operator_name, comment, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, actionType, operatorId, operatorName, comment || null, details || null]
  );
}
