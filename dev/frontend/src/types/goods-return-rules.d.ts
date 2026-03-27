import type { PaginationParams, PaginatedResult } from './warning';

/**
 * 商品退货规则信息
 */
export interface GoodsReturnRule {
  id: number;
  goodsId: string;
  goodsName: string;
  canReturnToSupplier: boolean;
  confirmedBy: number | null;
  confirmedAt: string | null;
  comment: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  confirmedByName?: string;
}

/**
 * 商品退货规则查询参数
 */
export interface GoodsReturnRuleQueryParams extends PaginationParams {
  canReturnToSupplier?: boolean;
}

/**
 * 商品退货规则统计信息
 */
export interface GoodsReturnRuleStats {
  canReturn: number;
  cannotReturn: number;
  total: number;
}

/**
 * 创建商品退货规则参数
 */
export interface CreateGoodsReturnRuleParams {
  goodsId: string;
  goodsName: string;
  canReturnToSupplier: boolean;
  comment?: string;
}

/**
 * 更新商品退货规则参数
 */
export interface UpdateGoodsReturnRuleParams {
  canReturnToSupplier: boolean;
  comment?: string;
}

/**
 * 批量设置规则参数
 */
export interface BatchSetRulesParams {
  goodsIds: string[];
  canReturnToSupplier: boolean;
  comment?: string;
}

/**
 * 批量设置结果
 */
export interface BatchSetRulesResult {
  successCount: number;
  failedCount: number;
}
