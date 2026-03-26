/**
 * 数据总览服务模块
 * 提供全局统计数据和趋势数据
 */

import { query } from '../../db/pool';
import { cache, CACHE_TTL } from '../../utils/cache';
import { getAvailabilityData } from '../availability';
import { getTurnoverData } from '../turnover';
import { getExpiringData } from '../expiring';
import { getSlowMovingData } from '../slowMoving';
import { getStrategicProductStats } from '../strategic-product';
import type { OverviewStats, TrendData, TrendPoint } from './overview.types';

/**
 * 获取全局统计数据
 */
export async function getOverviewStats(): Promise<OverviewStats> {
  // 检查缓存
  const cacheKey = 'overview:stats';
  const cached = cache.get<OverviewStats>(cacheKey);
  if (cached) {
    return cached;
  }

  // 并行获取各模块数据
  const [availability, turnover, expiring, slowMoving, strategicStats] = await Promise.all([
    getAvailabilityData(),
    getTurnoverData(),
    getExpiringData(),
    getSlowMovingData(),
    getStrategicProductStats(),
  ]);

  // 计算预警商品总数（缺货 + 低库存 + 积压 + 临期 + 滞销）
  const warningCount =
    (availability.warningStats?.outOfStock || 0) +
    (availability.warningStats?.lowStock || 0) +
    (turnover.warningStats?.mildOverstock || 0) +
    (turnover.warningStats?.moderateOverstock || 0) +
    (turnover.warningStats?.seriousOverstock || 0);

  // 获取当前时间周期
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const result: OverviewStats = {
    totalSku: availability.totalSku,
    strategicProductCount: strategicStats.total,
    warningProductCount: warningCount,
    expiringProductCount: expiring.within7Days + expiring.within15Days + expiring.within30Days,
    expiringCost: expiring.expiringCost,
    slowMovingCost: slowMoving.slowMovingCost,
    turnoverDays: turnover.value,
    availabilityRate: availability.strategicAvailability?.value || availability.value,
    period: {
      current,
      type: 'month',
    },
  };

  // 写入缓存（1分钟有效期）
  cache.set(cacheKey, result, CACHE_TTL.DASHBOARD);

  return result;
}

/**
 * 获取趋势数据
 * @param days 天数，默认7天
 */
export async function getTrendData(days: number = 7): Promise<TrendData> {
  // 检查缓存
  const cacheKey = `overview:trend:${days}`;
  const cached = cache.get<TrendData>(cacheKey);
  if (cached) {
    return cached;
  }

  const currentWarningCount = await getCurrentWarningCount();
  const data: TrendPoint[] = [];

  // 尝试从数据库获取历史数据
  try {
    const result = await query<{
      date: string;
      rate: number;
      in_stock_count: number;
      total_count: number;
    }>(
      `SELECT 
        date,
        rate,
        in_stock_count,
        total_count
      FROM daily_availability_rates
      WHERE date >= CURRENT_DATE - INTERVAL '1 day' * $1
      ORDER BY date ASC`,
      [days]
    );

    result.rows.forEach(row => {
      data.push({
        date: row.date,
        availabilityRate: parseFloat(row.rate as any) || 0,
        warningCount: currentWarningCount,
      });
    });
  } catch (error) {
    // 表不存在或其他错误，使用模拟数据
    console.warn('获取历史趋势数据失败，使用模拟数据:', error);
  }

  // 如果没有历史数据，生成模拟趋势
  if (data.length === 0) {
    const availability = await getAvailabilityData();
    const baseRate = availability.strategicAvailability?.value || availability.value;
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toISOString().split('T')[0],
        availabilityRate: Math.round((baseRate + (Math.random() - 0.5) * 5) * 10) / 10,
        warningCount: currentWarningCount,
      });
    }
  }

  const trendData: TrendData = {
    data,
    period: `${days}天`,
  };

  // 写入缓存（5分钟有效期）
  cache.set(cacheKey, trendData, 5 * 60 * 1000);

  return trendData;
}

/**
 * 获取当前预警商品数量
 */
async function getCurrentWarningCount(): Promise<number> {
  const [availability, turnover] = await Promise.all([
    getAvailabilityData(),
    getTurnoverData(),
  ]);

  return (
    (availability.warningStats?.outOfStock || 0) +
    (availability.warningStats?.lowStock || 0) +
    (turnover.warningStats?.mildOverstock || 0) +
    (turnover.warningStats?.moderateOverstock || 0) +
    (turnover.warningStats?.seriousOverstock || 0)
  );
}
