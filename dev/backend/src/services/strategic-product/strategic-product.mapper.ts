/**
 * 战略商品 DTO 映射器
 * 负责数据库实体(snake_case) ↔ API DTO(camelCase) 的双向转换
 */

import { toCamelKeys, toSnakeKeys } from '../../utils/keyConvert';
import type {
  StrategicProduct,
  StrategicProductStats,
  ProductForSelection,
  AddStrategicProductsParams,
} from './strategic-product.types';

// ==================== 数据库行类型 ====================

/** 战略商品数据库行（snake_case） */
export interface StrategicProductRow {
  id: number;
  goods_id: string;
  goods_name: string;
  category_path: string;
  status: string;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  procurement_confirmed: boolean;
  procurement_confirmed_by: number | null;
  procurement_confirmed_at: Date | null;
  procurement_confirmer_name?: string;
  marketing_confirmed: boolean;
  marketing_confirmed_by: number | null;
  marketing_confirmed_at: Date | null;
  marketing_confirmer_name?: string;
  confirmed_at: Date | null;
}

/** 统计数据库行 */
export interface StrategicProductStatsRow {
  pending?: string;
  confirmed?: string;
  rejected?: string;
  total?: string;
}

/** 商品选择数据库行 */
export interface ProductForSelectionRow {
  goods_id: string;
  goods_name: string;
  category_path: string | null;
  stock: string;
  pkg_unit_name?: string;
  base_unit_name?: string;
  unit_factor?: number;
}

// ==================== 实体 → DTO（用于响应） ====================

/**
 * 战略商品行 → StrategicProduct 实体
 * 使用 toCamelKeys 做键名转换，额外处理关联字段
 */
export function toStrategicProductDTO(row: StrategicProductRow): StrategicProduct {
  const base = toCamelKeys<any>(row);
  return {
    ...base,
    procurementConfirmerName: row.procurement_confirmer_name || undefined,
    marketingConfirmerName: row.marketing_confirmer_name || undefined,
  };
}

/**
 * 统计行 → StrategicProductStats
 */
export function toStrategicProductStatsDTO(row: StrategicProductStatsRow): StrategicProductStats {
  return {
    pending: parseInt(row?.pending as any) || 0,
    confirmed: parseInt(row?.confirmed as any) || 0,
    rejected: parseInt(row?.rejected as any) || 0,
    total: parseInt(row?.total as any) || 0,
  };
}

/**
 * 商品选择行 → ProductForSelection
 */
export function toProductForSelectionDTO(row: ProductForSelectionRow, strategicGoodsIds: Set<string>): ProductForSelection {
  // 生成规格字符串（单位换算关系）
  let specification = '';
  const pkgUnit = row.pkg_unit_name;
  const baseUnit = row.base_unit_name;
  const unitFactor = row.unit_factor;

  if (pkgUnit && baseUnit && pkgUnit !== baseUnit && unitFactor && unitFactor > 1) {
    specification = `1${pkgUnit}=${unitFactor}${baseUnit}`;
  } else if (pkgUnit) {
    specification = pkgUnit;
  }

  return {
    goodsId: row.goods_id,
    goodsName: row.goods_name,
    specification,
    categoryPath: row.category_path || '',
    stock: parseFloat(row.stock as any) || 0,
    isStrategic: strategicGoodsIds.has(row.goods_id),
  };
}

// ==================== DTO → 实体参数（用于请求） ====================

/**
 * 创建战略商品请求 → 数据库插入参数
 */
export function fromAddStrategicProductsDTO(dto: AddStrategicProductsParams): unknown {
  return toSnakeKeys(dto);
}
