/**
 * 库存齐全率服务模块类型定义
 */

/** 趋势方向 */
export type TrendDirection = 'up' | 'down' | 'flat';

/** 预警级别 */
export type WarningLevel = 'normal' | 'attention' | 'warning' | 'serious';

/** 健康状态 */
export type HealthStatus = 'excellent' | 'good' | 'attention' | 'warning';

/** 品类指标 */
export interface CategoryMetric {
  categoryId: string;
  categoryName: string;
  value: number;
  trend: number;
  trendDirection: TrendDirection;
  productCount: number;
}

/** 库存预警统计 */
export interface StockWarningStats {
  outOfStock: number;
  lowStock: number;
}

/** 战略商品齐全率数据 */
export interface StrategicAvailabilityData {
  value: number;
  totalStrategicSku: number;
  inStockStrategic: number;
}

/** 每日齐全率 */
export interface DailyAvailabilityRate {
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 当日齐全率 */
  rate: number;
  /** 当日有库存商品数 */
  inStockCount: number;
}

/** 战略商品月度齐全率数据 */
export interface StrategicMonthlyAvailabilityData {
  /** 月度平均齐全率（百分比，保留一位小数） */
  value: number;
  /** 战略商品总数 */
  totalStrategicSku: number;
  /** 当月统计天数 */
  daysInMonth: number;
  /** 每日齐全率明细（用于图表展示） */
  dailyRates: DailyAvailabilityRate[];
}

/** 库存齐全率数据 */
export interface AvailabilityData {
  value: number;
  unit: 'percent';
  totalSku: number;
  categories: CategoryMetric[];
  warningStats: StockWarningStats;
  strategicAvailability?: StrategicAvailabilityData;
  strategicMonthlyAvailability?: StrategicMonthlyAvailabilityData;
}

/** 品类树节点 */
export interface CategoryTreeNode {
  name: string;
  value: number;
  availabilityRate: number;
  inStockCount: number;
  totalCount: number;
  categoryPath: string;
  children?: CategoryTreeNode[];
}

/** 分页参数 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/** 分页返回结果 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
