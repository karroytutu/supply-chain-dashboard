import type { PaginationParams, PaginatedResult } from './warning';

/**
 * 战略商品状态
 */
export type StrategicProductStatus = 'pending' | 'confirmed' | 'rejected';

/**
 * 战略商品信息
 */
export interface StrategicProduct {
  id: number;
  goodsId: string;
  goodsName: string;
  categoryPath: string;
  status: StrategicProductStatus;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  procurementConfirmed: boolean;
  procurementConfirmedBy: number | null;
  procurementConfirmedAt: string | null;
  marketingConfirmed: boolean;
  marketingConfirmedBy: number | null;
  marketingConfirmedAt: string | null;
  confirmedAt: string | null;
}

/**
 * 战略商品统计信息
 */
export interface StrategicProductStats {
  total: number;
  pending: number;
  confirmed: number;
  rejected: number;
}

/**
 * 品类树节点（用于战略商品选择）
 */
export interface CategoryNode {
  id: string;
  name: string;
  level: number;
  path: string;
  children?: CategoryNode[];
}

/**
 * 可选商品信息（用于添加战略商品）
 */
export interface SelectableProduct {
  goodsId: string;
  goodsName: string;
  categoryPath: string;
  categoryId: string;
}

/**
 * 战略商品查询参数
 */
export interface StrategicProductQueryParams extends PaginationParams {
  status?: StrategicProductStatus;
  categoryId?: string;
  keyword?: string;
}

/**
 * 添加战略商品请求
 */
export interface AddStrategicProductsRequest {
  goodsIds: string[];
}

/**
 * 确认战略商品请求
 */
export interface ConfirmStrategicProductRequest {
  confirmed: boolean; // true=确认, false=驳回
  reason?: string;    // 驳回原因
}

/**
 * 战略等级数据
 */
export interface StrategicLevelData {
  level: string;
  count: number;
}
