/**
 * 商品退货规则类型定义
 */

import type { PaginatedResult } from '../warning/warning.types';

/** 商品退货规则实体 */
export interface GoodsReturnRule {
  id: number;
  goodsId: string;
  goodsName: string;
  canReturnToSupplier: boolean;
  confirmedBy: number | null;
  confirmedAt: Date | null;
  comment: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  confirmedByName?: string;
}

/** 商品退货规则列表查询参数 */
export interface GoodsReturnRuleQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  canReturnToSupplier?: boolean;
}

/** 创建商品退货规则参数 */
export interface CreateGoodsReturnRuleParams {
  goodsId: string;
  goodsName: string;
  canReturnToSupplier: boolean;
  comment?: string;
  userId: number;
}

/** 更新商品退货规则参数 */
export interface UpdateGoodsReturnRuleParams {
  canReturnToSupplier: boolean;
  comment?: string;
  userId: number;
}

/** 批量设置规则参数 */
export interface BatchSetRulesParams {
  goodsIds: string[];
  canReturnToSupplier: boolean;
  comment?: string;
  userId: number;
}

/** 批量设置结果 */
export interface BatchSetRulesResult {
  successCount: number;
  failedCount: number;
}

/** 商品退货规则统计数据 */
export interface GoodsReturnRuleStats {
  canReturn: number;
  cannotReturn: number;
  total: number;
}

export type GoodsReturnRuleListResult = PaginatedResult<GoodsReturnRule>;
