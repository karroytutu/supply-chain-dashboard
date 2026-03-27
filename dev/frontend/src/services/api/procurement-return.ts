/**
 * 退货单管理 API 服务
 */
import request from './request';
import type { PaginatedResult } from '@/types/warning';
import type {
  ReturnOrder,
  ReturnOrderQueryParams,
  ReturnOrderStats,
  ReturnAction,
  BatchConfirmReturnOrdersParams,
  BatchConfirmResult,
  FillErpReturnNoParams,
  WarehouseExecuteParams,
  MarketingSaleCompleteParams,
  CancelReturnOrderParams,
} from '@/types/procurement-return';

/**
 * 获取退货单列表
 */
export const getReturnOrders = (
  params?: ReturnOrderQueryParams
): Promise<PaginatedResult<ReturnOrder>> => {
  return request.get<PaginatedResult<ReturnOrder>>('/return-orders', { params });
};

/**
 * 获取退货单详情
 */
export const getReturnOrderById = (id: number): Promise<ReturnOrder> => {
  return request.get<ReturnOrder>(`/return-orders/${id}`);
};

/**
 * 获取退货单统计信息
 */
export const getReturnOrderStats = (): Promise<ReturnOrderStats> => {
  return request.get<ReturnOrderStats>('/return-orders/stats');
};

/**
 * 获取待填写ERP退货单列表
 */
export const getPendingErpOrders = (): Promise<ReturnOrder[]> => {
  return request.get<ReturnOrder[]>('/return-orders/pending-erp');
};

/**
 * 获取退货单操作记录
 */
export const getReturnOrderActions = (orderId: number): Promise<ReturnAction[]> => {
  return request.get<ReturnAction[]>(`/return-orders/${orderId}/actions`);
};

/**
 * 批量确认退货单
 */
export const batchConfirmReturnOrders = (
  data: BatchConfirmReturnOrdersParams
): Promise<BatchConfirmResult> => {
  return request.post<BatchConfirmResult>('/return-orders/batch-confirm', data);
};

/**
 * 取消退货单
 */
export const cancelReturnOrder = (
  id: number,
  data: CancelReturnOrderParams
): Promise<void> => {
  return request.post(`/return-orders/${id}/cancel`, data);
};

/**
 * ERP退货单填写
 */
export const fillErpReturnNo = (
  id: number,
  data: FillErpReturnNoParams
): Promise<ReturnOrder> => {
  return request.post<ReturnOrder>(`/return-orders/${id}/erp-fill`, data);
};

/**
 * 仓储执行
 */
export const warehouseExecute = (
  id: number,
  data: WarehouseExecuteParams
): Promise<ReturnOrder> => {
  return request.post<ReturnOrder>(`/return-orders/${id}/warehouse`, data);
};

/**
 * 营销销售完成
 */
export const marketingSaleComplete = (
  id: number,
  data: MarketingSaleCompleteParams
): Promise<ReturnOrder> => {
  return request.post<ReturnOrder>(`/return-orders/${id}/marketing`, data);
};

export default {
  getReturnOrders,
  getReturnOrderById,
  getReturnOrderStats,
  getPendingErpOrders,
  getReturnOrderActions,
  batchConfirmReturnOrders,
  cancelReturnOrder,
  fillErpReturnNo,
  warehouseExecute,
  marketingSaleComplete,
};
