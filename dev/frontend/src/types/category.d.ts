import { WarningLevel, HealthStatus, TrendDirection } from './dashboard';

// 商品库存状态
export type StockStatus = 'available' | 'low_stock' | 'out_of_stock';

// 商品库存信息
export interface ProductStock {
  quantity: number;
  warehouseLocation: string;
  lastInboundDate: string;
  lastOutboundDate: string;
}

// 商品周转信息
export interface ProductTurnover {
  days: number;
  avgDailySales: number;
  status: HealthStatus;
}

// 商品临期信息
export interface ProductExpiring {
  isExpiring: boolean;
  daysToExpiry: number;
  warningLevel: WarningLevel;
  expiryDate: string;
}

// 商品滞销信息
export interface ProductSlowMoving {
  isSlowMoving: boolean;
  daysWithoutSales: number;
  lastSaleDate: string | null;
}

// 商品齐全状态
export interface ProductAvailability {
  status: StockStatus;
  shortageQuantity: number;
}

// 商品详情
export interface Product {
  productId: string;
  productCode: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  brand?: string;
  specification?: string;

  // 库存信息
  stock: ProductStock;

  // 周转信息
  turnover: ProductTurnover;

  // 临期信息
  expiring: ProductExpiring;

  // 滞销信息
  slowMoving: ProductSlowMoving;

  // 齐全状态
  availability: ProductAvailability;
}

// 品类指标数据
export interface CategoryMetricDetail {
  categoryId: string;
  categoryName: string;
  parentId: string | null;
  level: number;

  // 指标数据
  metrics: {
    availability: number;
    turnoverDays: number;
    expiringRate: number;
    slowMovingRate: number;
  };

  // 环比数据
  trends: {
    availability: number;
    turnoverDays: number;
    expiringRate: number;
    slowMovingRate: number;
  };

  // 商品数量
  productCount: number;

  // 商品列表
  products?: Product[];
}

// 下钻状态
export interface DrillDownState {
  visible: boolean;
  metricType: 'availability' | 'turnover' | 'expiring' | 'slowMoving';
  currentLevel: 'category' | 'product';
  currentCategory: CategoryMetricDetail | null;
  breadcrumb: BreadcrumbItem[];
}

// 面包屑项
export interface BreadcrumbItem {
  title: string;
  categoryId?: string;
}
