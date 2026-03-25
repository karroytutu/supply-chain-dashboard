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
  key: string;    // 品类路径，用于查询
  name: string;
  level: number;
  path: string;
  count?: number;
  children?: CategoryNode[];
}

/**
 * 可选商品信息（用于添加战略商品）
 */
export interface SelectableProduct {
  goodsId: string;
  goodsName: string;
  specification: string;  // 规格（单位换算关系，如 "1件=24个"）
  categoryPath: string;
  stock?: number;
  isStrategic?: boolean;
}

/**
 * 战略商品查询参数
 */
export interface StrategicProductQueryParams extends PaginationParams {
  status?: StrategicProductStatus;
  categoryPath?: string;
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
  action: 'confirm' | 'reject';
  comment?: string;
}

/**
 * 战略等级数据
 */
export interface StrategicLevelData {
  level: string;
  count: number;
}

/**
 * 批量操作参数（支持全选全部）
 */
export interface BatchOperationParams {
  ids?: number[];
  selectAll?: boolean;
  status?: StrategicProductStatus;
  categoryPath?: string;
  keyword?: string;
}
