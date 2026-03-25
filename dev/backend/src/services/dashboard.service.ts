/**
 * Dashboard 服务聚合入口
 * 负责聚合各业务模块数据，提供统一的 API
 */

import { cache, CACHE_TTL } from '../utils/cache';

// 导入各业务模块
import { getAvailabilityData, getCategoryTreeData, getOutOfStockProductsByCategory } from './availability';
import { getTurnoverData } from './turnover';
import { getExpiringData } from './expiring';
import { getSlowMovingData } from './slowMoving';
import { getWarningProducts } from './warning';

// 重导出类型（保持向后兼容）- 从各模块分别导出
export type {
  TrendDirection,
  WarningLevel,
  HealthStatus,
  CategoryMetric,
  StockWarningStats,
  AvailabilityData,
  CategoryTreeNode,
  PaginationParams,
  PaginatedResult,
} from './availability';

export type {
  TurnoverWarningStats,
  TurnoverData,
} from './turnover';

export type {
  ExpiringBreakdown,
  ExpiringData,
} from './expiring';

export type {
  SlowMovingDistribution,
  SlowMovingWarningStats,
  SlowMovingData,
} from './slowMoving';

export type {
  WarningProduct,
} from './warning';

// 重导出业务模块函数（保持向后兼容）
export { getCategoryTreeData, getOutOfStockProductsByCategory, getWarningProducts };

/**
 * 时间周期
 */
export interface Period {
  current: string;
  previous: string;
  type: 'month' | 'quarter' | 'year';
}

/**
 * Dashboard 概览数据
 */
export interface DashboardOverview {
  availability: import('./availability').AvailabilityData;
  turnover: import('./turnover').TurnoverData;
  expiring: import('./expiring').ExpiringData;
  slowMoving: import('./slowMoving').SlowMovingData;
  period: Period;
}

/**
 * 获取 Dashboard 概览数据
 */
export async function getDashboardData(): Promise<DashboardOverview> {
  // 检查缓存
  const cacheKey = 'dashboard:overview';
  const cached = cache.get<DashboardOverview>(cacheKey);
  if (cached) {
    return cached;
  }

  // 并行获取各模块数据
  const [availability, turnover, expiring, slowMoving] = await Promise.all([
    getAvailabilityData(),
    getTurnoverData(),
    getExpiringData(),
    getSlowMovingData(),
  ]);

  // 获取当前时间周期
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const previous = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

  const result: DashboardOverview = {
    availability,
    turnover,
    expiring,
    slowMoving,
    period: {
      current,
      previous,
      type: 'month' as const,
    },
  };

  // 写入缓存（1分钟有效期）
  cache.set(cacheKey, result, CACHE_TTL.DASHBOARD);

  return result;
}
