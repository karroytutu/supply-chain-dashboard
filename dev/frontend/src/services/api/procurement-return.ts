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
  CancelReturnOrderParams,
  UploadReturnEvidenceResponse,
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
 * 上传退货凭证图片
 */
export const uploadReturnEvidence = async (file: File): Promise<UploadReturnEvidenceResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const token = localStorage.getItem('auth_token');
  const response = await fetch('/api/return-orders/upload-evidence', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`上传失败: ${response.status}`);
  }

  return response.json();
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
 * 回退退货单
 */
export const rollbackReturnOrder = (
  id: number,
  data?: { comment?: string }
): Promise<ReturnOrder> => {
  return request.post<ReturnOrder>(`/return-orders/${id}/rollback`, data);
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
  rollbackReturnOrder,
};
