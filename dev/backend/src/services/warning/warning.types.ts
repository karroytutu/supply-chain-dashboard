/**
 * 预警商品服务模块类型定义
 */

/** 战略等级类型 */
export type StrategicLevel = 'strategic' | 'normal';

/** 分页参数 */
export interface PaginationParams {
  page: number;
  pageSize: number;
  /** 战略等级筛选（可选） */
  strategicLevel?: StrategicLevel;
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
  /** 战略等级 */
  strategicLevel?: 'strategic' | 'normal';
}
