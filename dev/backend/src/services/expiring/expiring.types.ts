/**
 * 临期商品服务模块类型定义
 */

/** 预警级别 */
export type WarningLevel = 'normal' | 'attention' | 'warning' | 'serious';

/** 健康状态 */
export type HealthStatus = 'excellent' | 'good' | 'attention' | 'warning';

/** 趋势方向 */
export type TrendDirection = 'up' | 'down' | 'flat';

/** 品类指标 */
export interface CategoryMetric {
  categoryId: string;
  categoryName: string;
  value: number;
  trend: number;
  trendDirection: TrendDirection;
  productCount: number;
}

/** 临期分布 */
export interface ExpiringBreakdown {
  level: WarningLevel;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

/** 临期数据 */
export interface ExpiringData {
  value: number;
  unit: 'percent';
  trend: number;
  trendDirection: TrendDirection;
  healthStatus: HealthStatus;
  warningLevel: WarningLevel;
  breakdown: ExpiringBreakdown[];
  categories: CategoryMetric[];
  within7Days: number;
  within15Days: number;
  within30Days: number;
  expiringCost: number;
  totalCost: number;
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

/** 预警商品 */
export interface WarningProduct {
  productId: string;
  productCode: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  brand: string | null;
  specification: string | null;
  stock: {
    quantity: number;
    unitName?: string;
    costAmount?: number;
    warehouseLocation: string | null;
  };
  turnover: {
    days: number;
    avgDailySales?: number;
    avgDailyOutCost?: number;
  };
  expiring: {
    daysToExpiry: number | null;
    expiryDate: string | null;
  };
  availability: {
    status: 'out_of_stock' | 'low_stock' | 'available';
  };
}
