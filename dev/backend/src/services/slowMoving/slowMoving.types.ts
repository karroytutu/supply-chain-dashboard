/**
 * 滞销商品服务模块类型定义
 */

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

/** 滞销分布 */
export interface SlowMovingDistribution {
  range: string;
  label?: string;
  count: number;
  percentage: number;
}

/** 滞销预警统计 */
export interface SlowMovingWarningStats {
  mildSlowMoving: number;
  moderateSlowMoving: number;
  seriousSlowMoving: number;
}

/** 滞销数据 */
export interface SlowMovingData {
  value: number;
  unit: 'percent';
  trend: number;
  trendDirection: TrendDirection;
  distribution: SlowMovingDistribution[];
  categories: CategoryMetric[];
  slowMovingCost: number;
  totalCost: number;
  warningStats: SlowMovingWarningStats;
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
  slowMoving?: {
    daysWithoutSale: number;
    lastSaleDate: string | null;
  };
}
