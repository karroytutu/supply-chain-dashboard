/**
 * 商品退货规则管理 API 服务
 */
import request from './request';
import type { PaginatedResult } from '@/types/warning';
import type {
  GoodsReturnRule,
  GoodsReturnRuleQueryParams,
  GoodsReturnRuleStats,
  CreateGoodsReturnRuleParams,
  UpdateGoodsReturnRuleParams,
  BatchSetRulesParams,
  BatchSetRulesResult,
} from '@/types/goods-return-rules';

/**
 * 获取商品退货规则列表
 */
export const getGoodsReturnRules = (
  params?: GoodsReturnRuleQueryParams
): Promise<PaginatedResult<GoodsReturnRule>> => {
  return request.get<PaginatedResult<GoodsReturnRule>>('/goods-return-rules', { params });
};

/**
 * 获取商品退货规则统计信息
 */
export const getGoodsReturnRuleStats = (): Promise<GoodsReturnRuleStats> => {
  return request.get<GoodsReturnRuleStats>('/goods-return-rules/stats');
};

/**
 * 创建商品退货规则
 */
export const createGoodsReturnRule = (
  data: CreateGoodsReturnRuleParams
): Promise<GoodsReturnRule> => {
  return request.post<GoodsReturnRule>('/goods-return-rules', data);
};

/**
 * 更新商品退货规则
 */
export const updateGoodsReturnRule = (
  id: number,
  data: UpdateGoodsReturnRuleParams
): Promise<GoodsReturnRule> => {
  return request.put<GoodsReturnRule>(`/goods-return-rules/${id}`, data);
};

/**
 * 批量设置商品退货规则
 */
export const batchSetGoodsReturnRules = (
  data: BatchSetRulesParams
): Promise<BatchSetRulesResult> => {
  return request.post<BatchSetRulesResult>('/goods-return-rules/batch', data);
};

/**
 * 检查商品退货规则
 */
export const checkGoodsReturnRule = (goodsId: string): Promise<GoodsReturnRule | null> => {
  return request.get<GoodsReturnRule | null>(`/goods-return-rules/check/${goodsId}`);
};


