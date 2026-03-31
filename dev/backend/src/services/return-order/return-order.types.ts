/**
 * 退货单管理类型定义
 */

import type { PaginatedResult } from '../warning/warning.types';

/** 退货单状态 */
export type ReturnOrderStatus =
  | 'pending_confirm'
  | 'pending_erp_fill'
  | 'pending_warehouse_execute'
  | 'pending_marketing_sale'
  | 'completed'
  | 'cancelled';

/** 退货单实体 */
export interface ReturnOrder {
  id: number;
  returnNo: string;
  goodsId: string;
  goodsName: string;
  quantity: number;
  unit: string | null;
  batchDate: Date | null;
  returnDate: Date | null;
  expireDate: Date | null;
  shelfLife: number | null;
  daysToExpire: number | null;           // 当前剩余保质期（动态计算）
  daysToExpireAtReturn: number | null;   // 退货时剩余保质期（静态历史）
  status: ReturnOrderStatus;
  sourceBillNo: string | null;
  consumerName: string | null;
  marketingManager: string | null;
  erpReturnNo: string | null;
  erpFilledBy: number | null;
  erpFilledAt: Date | null;
  warehouseExecutedBy: number | null;
  warehouseExecutedAt: Date | null;
  warehouseReturnQuantity: number | null;
  warehouseComment: string | null;
  marketingCompletedBy: number | null;
  marketingCompletedAt: Date | null;
  marketingComment: string | null;
  ruleId: number | null;
  purchasePrice: number | null;          // 商品进价（用于考核计算）
  ruleConfirmedAt: Date | null;          // 规则确认时间（用于ERP录入超时考核）
  ruleConfirmedBy: number | null;        // 规则确认人
  createdAt: Date;
  updatedAt: Date;
  // 关联信息
  erpFillerName?: string;
  warehouseExecutorName?: string;
  marketingCompleterName?: string;
  // 库存信息
  currentStock: number | null;  // 当前残次品库存
}

/** 退货单列表查询参数 */
export interface ReturnOrderQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: ReturnOrderStatus;
  startDate?: string;
  endDate?: string;
}

/** 退货单统计数据 */
export interface ReturnOrderStats {
  pendingConfirm: number;
  pendingErpFill: number;
  pendingWarehouseExecute: number;
  pendingMarketingSale: number;
  completed: number;
  total: number;
}

/** 操作类型 */
export type ReturnActionType =
  | 'create'
  | 'confirm_rule'
  | 'erp_fill'
  | 'warehouse_execute'
  | 'marketing_complete'
  | 'cancel'
  | 'rollback';

/** 操作记录实体 */
export interface ReturnAction {
  id: number;
  orderId: number;
  actionType: ReturnActionType;
  operatorId: number | null;
  operatorName: string | null;
  actionAt: Date;
  comment: string | null;
  details: Record<string, any> | null;
}

/** 创建退货单参数 */
export interface CreateReturnOrderParams {
  returnNo: string;
  goodsId: string;
  goodsName: string;
  quantity: number;
  unit?: string;
  batchDate?: Date;
  returnDate?: Date;
  expireDate?: Date;
  shelfLife?: number;
  daysToExpire?: number;
  daysToExpireAtReturn?: number;  // 退货时剩余保质期
  sourceBillNo?: string;
  consumerName?: string;
  marketingManager?: string;
  status?: ReturnOrderStatus;
  purchasePrice?: number;  // 商品进价（用于考核计算）
}

/** 批量确认参数 */
export interface BatchConfirmReturnOrdersParams {
  orderIds: number[];
  ruleDecision: 'can_return' | 'cannot_return';
  operatorId: number;
  operatorName: string;
}

/** 批量确认结果 */
export interface BatchConfirmResult {
  successCount: number;
  failedCount: number;
}

/** 更新状态参数 */
export interface UpdateStatusParams {
  id: number;
  status: ReturnOrderStatus;
  operatorId: number;
  operatorName: string;
  comment?: string;
}

/** 填写ERP退货单号参数 */
export interface FillErpReturnNoParams {
  id: number;
  erpReturnNo: string;
  operatorId: number;
  operatorName: string;
}

/** 仓储执行参数 */
export interface WarehouseExecuteParams {
  id: number;
  returnQuantity: number;
  comment?: string;
  operatorId: number;
  operatorName: string;
}

/** 营销销售完成参数 */
export interface MarketingSaleCompleteParams {
  id: number;
  comment?: string;
  operatorId: number;
  operatorName: string;
}

/** 回退退货单参数 */
export interface RollbackReturnOrderParams {
  id: number;
  operatorId: number;
  operatorName: string;
  comment?: string;
}

export type ReturnOrderListResult = PaginatedResult<ReturnOrder>;
