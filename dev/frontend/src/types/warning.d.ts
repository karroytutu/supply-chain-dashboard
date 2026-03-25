import type { StockStatus } from './category';

/**
 * 战略等级类型
 */
export type StrategicLevel = 'strategic' | 'normal';

/**
 * 预警商品信息
 * 与后端 WarningProduct 接口对齐
 */
export interface WarningProduct {
  productId: string;
  productCode: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  brand?: string | null;
  specification?: string | null;

  // 库存信息
  stock: {
    quantity: number;
    unitName?: string;           // 包装单位名称（如：件、箱）
    costAmount?: number;         // 库存成本金额（金额周转率场景使用）
    warehouseLocation?: string | null;
  };

  // 周转信息
  turnover: {
    days: number;
    avgDailySales?: number;      // 日均销量（数量维度）
    avgDailyOutCost?: number;    // 日均出库成本（金额维度）
  };

  // 临期信息
  expiring: {
    daysToExpiry: number | null;
    expiryDate: string | null;
  };

  // 齐全状态
  availability: {
    status: StockStatus;
  };

  // 滞销信息
  slowMoving?: {
    daysWithoutSale: number;     // 未销售天数
    lastSaleDate: string | null; // 最后销售日期
  };

  // 战略等级
  strategicLevel?: StrategicLevel;
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * 分页返回结果
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 缺货商品简化信息
 */
export interface OutOfStockProductSimple {
  productName: string;
}
