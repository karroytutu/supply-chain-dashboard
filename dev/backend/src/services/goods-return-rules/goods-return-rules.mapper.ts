/**
 * 商品退货规则 DTO 映射器
 * 负责数据库实体(snake_case) ↔ API DTO(camelCase) 的双向转换
 */

import type {
  GoodsReturnRule,
  GoodsReturnRuleStats,
} from './goods-return-rules.types';

// ==================== 数据库行类型 ====================

/** 退货规则数据库行（snake_case） */
export interface GoodsReturnRuleRow {
  id: number;
  goods_id: string;
  goods_name: string;
  can_return_to_supplier: boolean;
  confirmed_by: number | null;
  confirmed_at: Date | null;
  comment: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  confirmed_by_name?: string | null;
}

// ==================== 实体 → DTO（用于响应） ====================

/**
 * 退货规则行 → GoodsReturnRule 实体
 */
export function toGoodsReturnRuleDTO(row: GoodsReturnRuleRow): GoodsReturnRule {
  return {
    id: row.id,
    goodsId: row.goods_id,
    goodsName: row.goods_name,
    canReturnToSupplier: row.can_return_to_supplier,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    comment: row.comment,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    confirmedByName: row.confirmed_by_name || undefined,
  };
}

/**
 * 统计行 → GoodsReturnRuleStats
 */
export function toGoodsReturnRuleStatsDTO(row: Record<string, any>): GoodsReturnRuleStats {
  return {
    canReturn: parseInt(row.can_return) || 0,
    cannotReturn: parseInt(row.cannot_return) || 0,
    total: parseInt(row.total) || 0,
  };
}
