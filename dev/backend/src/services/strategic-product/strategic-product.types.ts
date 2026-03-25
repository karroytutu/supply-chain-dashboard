/**
 * 战略商品管理类型定义
 */

import type { PaginatedResult } from '../warning/warning.types';

/** 战略商品状态 */
export type StrategicProductStatus = 'pending' | 'confirmed' | 'rejected';

/** 战略商品实体 */
export interface StrategicProduct {
  id: number;
  goodsId: string;
  goodsName: string;
  categoryPath: string;
  status: StrategicProductStatus;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
  procurementConfirmed: boolean;
  procurementConfirmedBy: number | null;
  procurementConfirmedAt: Date | null;
  procurementConfirmerName?: string;
  marketingConfirmed: boolean;
  marketingConfirmedBy: number | null;
  marketingConfirmedAt: Date | null;
  marketingConfirmerName?: string;
  confirmedAt: Date | null;
}

/** 战略商品列表查询参数 */
export interface StrategicProductQueryParams {
  page?: number;
  pageSize?: number;
  status?: StrategicProductStatus;
  categoryPath?: string;
  keyword?: string;
}

/** 战略商品统计数据 */
export interface StrategicProductStats {
  pending: number;
  confirmed: number;
  rejected: number;
  total: number;
}

/** 批量添加战略商品参数 */
export interface AddStrategicProductsParams {
  goodsIds: string[];
  userId: number;
}

/** 确认战略商品参数 */
export interface ConfirmStrategicProductParams {
  id: number;
  action: 'confirm' | 'reject';
  comment?: string;
  userId: number;
  userRoles: string[];
  userName: string;
}

/** 品类树节点（带商品信息） */
export interface CategoryTreeNode {
  key: string;
  name: string;
  path: string;
  level: number;
  count: number;
  children?: CategoryTreeNode[];
}

/** 商品信息（用于选择） */
export interface ProductForSelection {
  goodsId: string;
  goodsName: string;
  specification: string;  // 规格（单位换算关系，如 "1件=24个"）
  categoryPath: string;
  stock: number;
  isStrategic: boolean;
}

/** 获取商品查询参数 */
export interface GetProductsQueryParams {
  categoryPath?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export type StrategicProductListResult = PaginatedResult<StrategicProduct>;
export type ProductSelectionResult = PaginatedResult<ProductForSelection>;

/** 批量确认战略商品参数 */
export interface BatchConfirmStrategicProductsParams {
  ids?: number[];
  action: 'confirm' | 'reject';
  userId: number;
  userRoles: string[];
  userName: string;
  // 筛选条件（用于全选全部）
  selectAll?: boolean;
  status?: StrategicProductStatus;
  categoryPath?: string;
  keyword?: string;
}

/** 批量确认结果 */
export interface BatchConfirmResult {
  successCount: number;
  failedCount: number;
}

/** 批量删除参数 */
export interface BatchDeleteStrategicProductsParams {
  ids?: number[];
  // 筛选条件（用于全选全部）
  selectAll?: boolean;
  status?: StrategicProductStatus;
  categoryPath?: string;
  keyword?: string;
}

/** 批量删除结果 */
export interface BatchDeleteResult {
  deletedCount: number;
}
