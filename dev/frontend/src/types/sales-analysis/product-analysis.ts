/**
 * 商品分析板块类型定义
 */

import type { QuadrantKey } from './customer-analysis';

/** 商品核心指标 */
export interface ProductMetric {
  key: string;
  label: string;
  value: number;
  /** 环比变化（%） */
  momChange: number;
  /** 值格式（currency/count/percent） */
  valueType?: string;
}

/** Top 商品排行行 */
export interface TopProductRow {
  productId: string;
  productName: string;
  categoryName: string;
  salesVolume: number;
  salesAmount: number;
  profitAmount: number;
  momChange: number;
}

/** 品类销售排行项 */
export interface CategorySalesItem {
  categoryId: string;
  categoryName: string;
  salesAmount: number;
  salesPercentage: number;
}

/** 库存健康度项 */
export interface InventoryHealthItem {
  productId: string;
  productName: string;
  categoryName: string;
  /** 类型：缺货 or 积压 */
  type: 'shortage' | 'overstock';
  /** 库存量 */
  inventory: number;
  /** 本月销量 */
  salesVolume: number;
  /** 严重程度标签 */
  severityLabel: string;
}

/** 商品明细表行 */
export interface ProductDetailRow {
  productId: string;
  productName: string;
  categoryName: string;
  salesVolume: number;
  salesAmount: number;
  profitAmount: number;
  inventory: number;
  momChange: number;
  /** 象限分类 */
  quadrant: QuadrantKey;
}
