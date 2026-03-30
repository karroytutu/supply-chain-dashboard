/**
 * Dashboard API 服务
 */
import request from './request';
import type { DashboardOverview } from '@/types/dashboard';
import type { WarningProduct, PaginationParams, PaginatedResult } from '@/types/warning';

/**
 * 获取 Dashboard 概览数据
 */
export const getDashboardData = (): Promise<DashboardOverview> => {
  return request<DashboardOverview>('/dashboard');
};

/**
 * 获取预警商品列表（支持分页）
 */
export const getWarningProducts = (
  type: string,
  pagination?: PaginationParams
): Promise<PaginatedResult<WarningProduct>> => {
  const params = new URLSearchParams();
  if (pagination) {
    params.append('page', String(pagination.page));
    params.append('pageSize', String(pagination.pageSize));
  }
  const queryString = params.toString();
  const url = queryString ? `/warnings/${type}?${queryString}` : `/warnings/${type}`;
  return request<PaginatedResult<WarningProduct>>(url);
};

/**
 * 品类树节点类型
 */
export interface CategoryTreeNode {
  name: string;
  value: number;
  availabilityRate: number;
  inStockCount: number;
  totalCount: number;
  categoryPath: string;
  children?: CategoryTreeNode[];
}

/**
 * 获取完整的品类树数据（用于 Treemap 钻取）
 */
export const getCategoryTree = (): Promise<CategoryTreeNode[]> => {
  return request<CategoryTreeNode[]>('/availability/category-tree');
};

/**
 * 获取指定品类下的缺货商品列表
 */
export const getCategoryOutOfStockProducts = (
  categoryPath: string,
  pagination?: PaginationParams
): Promise<PaginatedResult<{ productName: string }>> => {
  const params = new URLSearchParams();
  params.append('categoryPath', categoryPath);
  if (pagination) {
    params.append('page', String(pagination.page));
    params.append('pageSize', String(pagination.pageSize));
  }
  return request<PaginatedResult<{ productName: string }>>(`/availability/out-of-stock?${params.toString()}`);
};

/**
 * 采购绩效月度存档记录
 */
export interface MonthlyArchiveRecord {
  id: number;
  archiveMonth: string;
  strategicAvailabilityRate: number | null;
  strategicTotalSku: number | null;
  strategicDaysInMonth: number | null;
  turnoverDays: number | null;
  turnoverPreviousDays: number | null;
  turnoverTrend: number | null;
  archivedAt: string;
  archivedBy: string;
}

/**
 * 采购绩效存档响应
 */
export interface ProcurementArchiveResponse {
  success: boolean;
  data: MonthlyArchiveRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 获取采购绩效月度存档列表
 */
export const getProcurementArchive = (
  pagination?: PaginationParams
): Promise<ProcurementArchiveResponse> => {
  const params = new URLSearchParams();
  if (pagination) {
    params.append('page', String(pagination.page));
    params.append('pageSize', String(pagination.pageSize));
  }
  const queryString = params.toString();
  const url = queryString ? `/procurement/archive?${queryString}` : '/procurement/archive';
  return request<ProcurementArchiveResponse>(url);
};

export default {
  getDashboardData,
  getWarningProducts,
  getCategoryTree,
  getCategoryOutOfStockProducts,
  getProcurementArchive,
};
