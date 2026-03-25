/**
 * 库存齐全率服务模块入口
 */

export { getAvailabilityData, getCategoryTreeData, getOutOfStockProductsByCategory } from './availability.service';
export type {
  AvailabilityData,
  CategoryMetric,
  CategoryTreeNode,
  StockWarningStats,
  PaginationParams,
  PaginatedResult,
  TrendDirection,
  WarningLevel,
  HealthStatus,
} from './availability.types';
