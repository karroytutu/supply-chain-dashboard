/**
 * 问题发现板块类型定义
 */

/** 风险分类标识 */
export type RiskCategoryKey = 'customer' | 'collection' | 'product' | 'expense';

/** 风险项 */
export interface RiskItem {
  key: string;
  label: string;
  count: number;
  unit: string;
  /** 子项摘要（如"环比下降>20%: 14家"） */
  meta: Array<{ label: string; value: string | number }>;
}

/** 风险分类 */
export interface RiskCategory {
  key: RiskCategoryKey;
  label: string;
  /** 移动端缩短文案 */
  shortLabel: string;
  items: RiskItem[];
}
