/**
 * 商品退货规则模块入口
 */

// 服务函数
export {
  getGoodsReturnRules,
  getGoodsReturnRuleStats,
  createGoodsReturnRule,
  updateGoodsReturnRule,
  batchSetGoodsReturnRules,
  checkGoodsReturnRule,
} from './goods-return-rules.service';

// 类型定义
export type {
  GoodsReturnRule,
  GoodsReturnRuleQueryParams,
  GoodsReturnRuleListResult,
  GoodsReturnRuleStats,
  CreateGoodsReturnRuleParams,
  UpdateGoodsReturnRuleParams,
  BatchSetRulesParams,
  BatchSetRulesResult,
} from './goods-return-rules.types';
