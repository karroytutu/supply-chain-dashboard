/**
 * 临期商品服务模块入口
 */

export { getExpiringData, getExpiringProducts } from './expiring.service';
export type {
  ExpiringData,
  ExpiringBreakdown,
  WarningProduct,
  PaginationParams,
  PaginatedResult,
  WarningLevel,
  HealthStatus,
  TrendDirection,
} from './expiring.types';
