/**
 * 战略商品 DTO 映射器
 * 负责数据库实体(snake_case) ↔ API DTO(camelCase) 的双向转换
 */

import { toCamelKeys, toSnakeKeys } from '../../utils/keyConvert';
import type {
  StrategicProduct,
  StrategicProductStats,
  ProductForSelection,
} from './strategic-product.types';

// ==================== 实体 → DTO（用于响应） ====================

/**
 * 战略商品行 → StrategicProduct 实体
 * 使用 toCamelKeys 做键名转换，额外处理关联字段
 */
export function toStrategicProductDTO(row: any): StrategicProduct {
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
export function toStrategicProductStatsDTO(row: any): StrategicProductStats {
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
export function toProductForSelectionDTO(row: any, strategicGoodsIds: Set<string>): ProductForSelection {
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
export function fromAddStrategicProductsDTO(dto: any): any {
  return toSnakeKeys(dto);
}
