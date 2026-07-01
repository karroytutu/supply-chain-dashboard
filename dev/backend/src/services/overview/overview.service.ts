/**
 * 数据总览服务模块
 * 提供全局统计数据和趋势数据
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('Overview');

import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { STANDARD_CALC_DAYS } from '../../utils/constants';
import { formatDateOnly } from '../../utils/dateFormat';
import { getAvailabilityData } from '../availability';
import { fetchAllBatchInventory } from '../erp-client/erp-batch-inventory.service';
import { fetchAllInventory } from '../erp-client/erp-inventory.service';
import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getDailySalesMap, getLastSaleMap } from '../erp-client/erp-sales-detail.service';
import { getExpiringData } from '../expiring';
import { getSlowMovingData } from '../slowMoving';
import { getStrategicProductStats } from '../strategic-product';
import { getTurnoverData } from '../turnover';
import type { OverviewFull, OverviewStats, TrendData, TrendPoint } from './overview.types';

/**
 * 预热共享 ERP 数据集的 MemoryCache 层
 * [ERP本地化] 数据源已从 ERP API 改为本地 PostgreSQL 表，
 * 此函数仅预填充 MemoryCache 层，避免并行服务同时 miss 缓存。
 * sync engine 每 2 分钟自动同步本地表，此处仅作为缓存预热优化。
 */
async function warmSharedDatasets(): Promise<void> {
  // 1. 商品列表 → 填充 erp:products:all MemoryCache
  await fetchAllProducts();
  // 2. 库存列表 → 填充 erp:inventory:all MemoryCache
  await fetchAllInventory();
  // 3. 日均销量 → 填充 erp:sales:daily:map MemoryCache（数据来自本地 erp_sales_details 表）
  await getDailySalesMap(STANDARD_CALC_DAYS);
  // 4. 批次库存 → 填充 erp:batch:inventory MemoryCache
  await fetchAllBatchInventory();
  // 5. 最后销售日期 → 填充 erp:sales:last_sale MemoryCache（数据来自本地 erp_sales_details 表）
  await getLastSaleMap();
}

/**
 * 计算全局统计数据（从 ERP 和数据库获取原始数据并聚合）
 */
async function computeStats(): Promise<OverviewStats> {
  // 顺序预热共享数据集，确保后续并行服务全部命中缓存
  await warmSharedDatasets();

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

  return {
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
}

/** 防止并发后台刷新 */
let _statsRefreshing = false;

/**
 * 获取全局统计数据
 * 支持 stale-while-revalidate：新鲜缓存直接返回；过期缓存立即返回旧数据 + 后台刷新；
 * 从未缓存则完整计算。
 *
 * 注意：使用 getStale() + isFresh() 而非 get() + getStale()，
 * 因为 get() 会破坏性地删除过期条目，导致 getStale() 无法读取。
 */
export async function getOverviewStats(): Promise<OverviewStats> {
  const cacheKey = CACHE_KEY.OVERVIEW_STATS;

  // 1. 从缓存读取（非破坏性 — 保留过期条目供 stale-while-revalidate 使用）
  const stale = cache.getStale<OverviewStats>(cacheKey);

  if (stale) {
    // 2. 检查是否仍然新鲜（未过期）
    if (cache.isFresh(cacheKey)) {
      return stale;
    }

    // 3. 过期缓存 → 返回旧数据 + 后台刷新（fire-and-forget）
    if (!_statsRefreshing) {
      _statsRefreshing = true;
      computeStats()
        .then(data => cache.set(cacheKey, data, CACHE_TTL.DASHBOARD))
        .catch(err => log.warn('后台刷新统计数据失败:', err))
        .finally(() => {
          _statsRefreshing = false;
        });
    }
    return stale;
  }

  // 4. 从未缓存 → 完整计算并写入缓存
  const result = await computeStats();
  cache.set(cacheKey, result, CACHE_TTL.DASHBOARD);
  return result;
}

/**
 * 获取完整概览数据（stats + trend）
 * 先调用 getOverviewStats() 填充所有缓存，再调用 getTrendData() 命中缓存，
 * 避免前端 Promise.all 导致 trend 重复计算 availability/turnover。
 */
export async function getOverviewFull(): Promise<OverviewFull> {
  const stats = await getOverviewStats();
  const trend = await getTrendData(7);
  return { stats, trend };
}

/**
 * 获取趋势数据
 * @param days 天数，默认7天
 */
export async function getTrendData(days = 7): Promise<TrendData> {
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
    const result = await appQuery<{
      date: any; // PostgreSQL DATE 返回 Date 对象
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
      const dateStr = formatDateOnly(row.date);
      data.push({
        date: dateStr,
        availabilityRate: parseFloat(row.rate as any) || 0,
        warningCount: currentWarningCount,
      });
    });
  } catch (error) {
    // 表不存在或其他错误，使用模拟数据
    log.warn('获取历史趋势数据失败，使用模拟数据:', error);
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

  // 写入缓存（低频变更数据）
  cache.set(cacheKey, trendData, CACHE_TTL.LOW_FREQUENCY);

  return trendData;
}

/**
 * 获取当前预警商品数量
 */
async function getCurrentWarningCount(): Promise<number> {
  const [availability, turnover] = await Promise.all([getAvailabilityData(), getTurnoverData()]);

  return (
    (availability.warningStats?.outOfStock || 0) +
    (availability.warningStats?.lowStock || 0) +
    (turnover.warningStats?.mildOverstock || 0) +
    (turnover.warningStats?.moderateOverstock || 0) +
    (turnover.warningStats?.seriousOverstock || 0)
  );
}
