/**
 * 客户分析板块类型定义
 */

/** 客户核心指标 */
export interface CustomerMetric {
  key: string;
  label: string;
  value: number;
  /** 环比变化（%） */
  momChange: number;
  /** 值格式（currency/count/percent） */
  valueType?: string;
}

/** 四象限键 */
export type QuadrantKey = 'star' | 'traffic' | 'potential' | 'problem';

/** 四象限配置（通用，props 驱动） */
export interface QuadrantConfig {
  key: QuadrantKey;
  label: string;
  tagColor: string;
  tagText: string;
}

/** 四象限统计结果 */
export interface QuadrantStat {
  key: QuadrantKey;
  count: number;
  percentage: string;
  salesPercentage: string;
}

/** Top 客户排行行 */
export interface TopCustomerRow {
  customerId: string;
  customerName: string;
  salesAmount: number;
  profitAmount: number;
  collectionAmount: number;
  categoryCount: number;
  marketerName: string;
  districtName: string;
}

/** 渠道/片区分布项 */
export interface DistributionItem {
  label: string;
  count: number;
  salesAmount: number;
  salesPercentage: number;
}

/** 客户集中度 */
export interface CustomerConcentration {
  top5Percentage: number;
  top10Percentage: number;
  top5SalesAmount: number;
  top10SalesAmount: number;
  totalSalesAmount: number;
}

/** 新老客户结构 */
export interface CustomerStructure {
  newCustomerCount: number;
  newCustomerSales: number;
  existingCustomerCount: number;
  existingCustomerSales: number;
}

/** 品类渗透分析 */
export interface CategoryPenetration {
  avgCategoryCount: number;
  belowAvgCount: number;
  totalCustomers: number;
}

/** 客户明细表行 */
export interface CustomerDetailRow {
  customerId: string;
  customerName: string;
  channel: string;
  district: string;
  marketerName: string;
  salesAmount: number;
  profitAmount: number;
  collectionAmount: number;
  orderCount: number;
  categoryCount: number;
  momChange: number;
  /** 象限分类 */
  quadrant: QuadrantKey;
}
