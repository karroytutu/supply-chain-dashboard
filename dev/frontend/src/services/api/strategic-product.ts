/**
 * 战略商品管理 API 服务
 */
import request from './request';
import type { PaginationParams, PaginatedResult } from '@/types/warning';
import type {
  StrategicProduct,
  StrategicProductStats,
  CategoryNode,
  SelectableProduct,
  StrategicProductQueryParams,
  AddStrategicProductsRequest,
  ConfirmStrategicProductRequest,
  StrategicLevelData,
} from '@/types/strategic-product';

/**
 * 获取战略商品列表
 */
export const getStrategicProducts = (
  params?: StrategicProductQueryParams
): Promise<PaginatedResult<StrategicProduct>> => {
  return request.get<PaginatedResult<StrategicProduct>>('/strategic-products', { params });
};

/**
 * 获取战略商品统计信息
 */
export const getStrategicProductStats = (): Promise<StrategicProductStats> => {
  return request.get<StrategicProductStats>('/strategic-products/stats');
};

/**
 * 添加战略商品
 */
export const addStrategicProducts = (data: AddStrategicProductsRequest): Promise<{ addedCount: number; skippedCount: number }> => {
  return request.post<{ addedCount: number; skippedCount: number }>('/strategic-products', data);
};

/**
 * 删除战略商品
 */
export const deleteStrategicProduct = (id: number): Promise<void> => {
  return request.delete(`/strategic-products/${id}`);
};

/**
 * 确认/驳回战略商品
 */
export const confirmStrategicProduct = (
  id: number,
  data: ConfirmStrategicProductRequest
): Promise<StrategicProduct> => {
  return request.post<StrategicProduct>(`/strategic-products/${id}/confirm`, data);
};

/**
 * 批量确认战略商品
 */
export const batchConfirmStrategicProducts = (
  data: { ids: number[]; action: 'confirm' | 'reject' }
): Promise<{ success: boolean; message: string; data: { successCount: number; failedCount: number } }> => {
  return request.post('/strategic-products/batch/confirm', data);
};

/**
 * 批量删除战略商品
 */
export const batchDeleteStrategicProducts = (
  data: { ids: number[] }
): Promise<{ success: boolean; message: string; data: { deletedCount: number } }> => {
  return request.post('/strategic-products/batch/delete', data);
};

/**
 * 获取品类树
 */
export const getCategoryTree = (): Promise<CategoryNode[]> => {
  return request.get<CategoryNode[]>('/strategic-products/categories/tree');
};

/**
 * 获取可选商品列表（用于添加战略商品）
 */
export const getProductsForSelection = (
  categoryPath?: string,
  params?: PaginationParams
): Promise<PaginatedResult<SelectableProduct>> => {
  const queryParams = { categoryPath, ...params };
  return request.get<PaginatedResult<SelectableProduct>>('/strategic-products/products', { params: queryParams });
};

/**
 * 获取战略等级列表（用于筛选）
 */
export const getStrategicLevels = (): Promise<StrategicLevelData[]> => {
  return request.get<StrategicLevelData[]>('/strategic-products/levels');
};

export default {
  getStrategicProducts,
  getStrategicProductStats,
  addStrategicProducts,
  deleteStrategicProduct,
  confirmStrategicProduct,
  batchConfirmStrategicProducts,
  batchDeleteStrategicProducts,
  getCategoryTree,
  getProductsForSelection,
  getStrategicLevels,
};
