/**
 * 预计算服务模块
 * 用于缓存和预计算常用的聚合数据，减少重复查询
 */

import { query } from '../db/pool';
import { cache, CACHE_TTL } from '../utils/cache';
import { STANDARD_CALC_DAYS } from '../utils/constants';

// 缓存键常量
const CACHE_KEYS = {
  DAILY_SALES_MAP: 'daily_sales:map',
  STOCK_SUMMARY_MAP: 'stock:summary:map',
};

/**
 * 获取日均销售数据（带缓存）
 * 返回 Map<goodsName, avgDailySales>
 */
export async function getDailySalesMap(): Promise<Map<string, number>> {
  const cacheKey = CACHE_KEYS.DAILY_SALES_MAP;

  // 检查缓存
  const cached = cache.get<Map<string, number>>(cacheKey);
  if (cached) {
    console.log('[getDailySalesMap] 使用缓存数据');
    return cached;
  }

  console.log('[getDailySalesMap] 缓存未命中，查询数据库...');

  const result = await query<{ goods_name: string; avg_daily: number }>(`
    SELECT
      "goodsName" as goods_name,
      SUM("baseQuantity") / ${STANDARD_CALC_DAYS}.0 as avg_daily
    FROM "销售结算明细表"
    WHERE "settleTime" >= NOW() - INTERVAL '${STANDARD_CALC_DAYS} days'
    GROUP BY "goodsName"
  `);

  const salesMap = new Map<string, number>();
  for (const row of result.rows) {
    salesMap.set(row.goods_name, parseFloat(row.avg_daily as any) || 0);
  }

  // 存入缓存
  cache.set(cacheKey, salesMap, CACHE_TTL.CATEGORY_STATS);
  console.log(`[getDailySalesMap] 数据已缓存，共 ${salesMap.size} 条记录`);

  return salesMap;
}

/**
 * 获取库存汇总数据（带缓存）
 * 返回 Map<goodsId, totalQuantity>
 */
export async function getStockSummaryMap(): Promise<Map<string, number>> {
  const cacheKey = CACHE_KEYS.STOCK_SUMMARY_MAP;

  // 检查缓存
  const cached = cache.get<Map<string, number>>(cacheKey);
  if (cached) {
    console.log('[getStockSummaryMap] 使用缓存数据');
    return cached;
  }

  console.log('[getStockSummaryMap] 缓存未命中，查询数据库...');

  const result = await query<{ goods_id: string; total_quantity: number }>(`
    SELECT
      "goodsId" as goods_id,
      SUM("availableBaseQuantity") as total_quantity
    FROM "实时库存表"
    GROUP BY "goodsId"
  `);

  const stockMap = new Map<string, number>();
  for (const row of result.rows) {
    stockMap.set(row.goods_id, parseFloat(row.total_quantity as any) || 0);
  }

  // 存入缓存
  cache.set(cacheKey, stockMap, CACHE_TTL.CATEGORY_STATS);
  console.log(`[getStockSummaryMap] 数据已缓存，共 ${stockMap.size} 条记录`);

  return stockMap;
}

/**
 * 预热所有缓存
 * 在服务启动时调用，提前加载热点数据
 */
export async function warmupCache(): Promise<void> {
  console.log('[warmupCache] 开始预热缓存...');

  try {
    // 并行预热多个缓存
    await Promise.all([
      getDailySalesMap(),
      getStockSummaryMap(),
    ]);

    console.log('[warmupCache] 缓存预热完成');
  } catch (error) {
    console.error('[warmupCache] 缓存预热失败:', error);
  }
}

/**
 * 清除预计算缓存
 * 当数据更新时调用
 */
export function invalidatePrecomputedCache(): void {
  cache.invalidate('daily_sales:');
  cache.invalidate('stock:summary:');
  console.log('[invalidatePrecomputedCache] 预计算缓存已清除');
}
