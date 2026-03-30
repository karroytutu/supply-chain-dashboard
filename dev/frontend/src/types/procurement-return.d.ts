import type { PaginationParams, PaginatedResult } from './warning';

/**
 * 退货单状态
 */
export type ReturnOrderStatus =
  | 'pending_confirm'
  | 'pending_erp_fill'
  | 'pending_warehouse_execute'
  | 'pending_marketing_sale'
  | 'completed'
  | 'cancelled';

/**
 * 退货单信息
 */
export interface ReturnOrder {
  id: number;
  returnNo: string;
  goodsId: string;
  goodsName: string;
  quantity: number;
  unit: string | null;
  batchDate: string | null;
  returnDate: string | null;
  expireDate: string | null;
  shelfLife: number | null;
  daysToExpire: number | null;           // 当前剩余保质期（动态计算）
  daysToExpireAtReturn: number | null;   // 退货时剩余保质期（静态历史）
  status: ReturnOrderStatus;
  sourceBillNo: string | null;
  consumerName: string | null;
  marketingManager: string | null;
  erpReturnNo: string | null;
  erpFilledBy: number | null;
  erpFilledAt: string | null;
  warehouseExecutedBy: number | null;
  warehouseExecutedAt: string | null;
  warehouseReturnQuantity: number | null;
  warehouseComment: string | null;
  marketingCompletedBy: number | null;
  marketingCompletedAt: string | null;
  marketingComment: string | null;
  ruleId: number | null;
  createdAt: string;
  updatedAt: string;
  // 关联信息
  erpFillerName?: string;
  warehouseExecutorName?: string;
  marketingCompleterName?: string;
}

/**
 * 退货单查询参数
 */
export interface ReturnOrderQueryParams extends PaginationParams {
  status?: ReturnOrderStatus;
  startDate?: string;
  endDate?: string;
}

/**
 * 退货单统计信息
 */
export interface ReturnOrderStats {
  pendingConfirm: number;
  pendingErpFill: number;
  pendingWarehouseExecute: number;
  pendingMarketingSale: number;
  completed: number;
  total: number;
}

/**
 * 操作类型
 */
export type ReturnActionType =
  | 'create'
  | 'confirm_rule'
  | 'erp_fill'
  | 'warehouse_execute'
  | 'marketing_complete'
  | 'cancel';

/**
 * 退货单操作记录
 */
export interface ReturnAction {
  id: number;
  orderId: number;
  actionType: ReturnActionType;
  operatorId: number | null;
  operatorName: string | null;
  actionAt: string;
  comment: string | null;
  details: Record<string, any> | null;
}

/**
 * 批量确认退货单参数
 */
export interface BatchConfirmReturnOrdersParams {
  orderIds: number[];
  ruleDecision: 'can_return' | 'cannot_return';
  comment?: string;
}

/**
 * 批量确认结果
 */
export interface BatchConfirmResult {
  successCount: number;
  failedCount: number;
}

/**
 * ERP退货单填写参数
 */
export interface FillErpReturnNoParams {
  erpReturnNo: string;
}

/**
 * 仓储执行参数
 */
export interface WarehouseExecuteParams {
  returnQuantity: number;
  comment?: string;
}

/**
 * 取消退货单参数
 */
export interface CancelReturnOrderParams {
  comment?: string;
}
