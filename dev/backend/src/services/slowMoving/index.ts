/**
 * 滞销商品服务模块入口
 */

export { getSlowMovingData, getSlowMovingProducts } from './slowMoving.service';
export type {
  SlowMovingData,
  SlowMovingDistribution,
  SlowMovingWarningStats,
  WarningProduct,
  PaginationParams,
  PaginatedResult,
  TrendDirection,
} from './slowMoving.types';
