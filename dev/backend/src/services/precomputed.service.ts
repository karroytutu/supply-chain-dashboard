/**
 * 预计算服务模块
 * 用于缓存和预计算常用的聚合数据，减少重复查询
 */
import { createLogger } from '../utils/logger';
const log = createLogger('Precomputed');

import { cache, CACHE_TTL } from '../utils/cache';
import { STANDARD_CALC_DAYS } from '../utils/constants';
import { getStockSummaryMap as getInventoryStockMap } from './erp-client/erp-inventory.service';
import { getDailySalesMap as getErpDailySalesMap } from './erp-client/erp-sales-detail.service';

// 缓存键常量
const CACHE_KEYS = {
  DAILY_SALES_MAP: 'daily_sales:map',
  STOCK_SUMMARY_MAP: 'stock:summary:map',
};

/**
 * 获取日均销售数据（通过 ERP 销售 API）
 * 返回 Map<goodsName, avgDailySales>
 */
export async function getDailySalesMap(): Promise<Map<string, number>> {
  const cacheKey = CACHE_KEYS.DAILY_SALES_MAP;

  // 检查本地缓存
  const cached = cache.get<Map<string, number>>(cacheKey);
  if (cached) {
    log.info('使用缓存数据');
    return cached;
  }

  log.info('缓存未命中，从 ERP API 获取...');

  // 从 ERP 销售 API 获取（API 层已有 60s 缓存）
  const salesMap = await getErpDailySalesMap(STANDARD_CALC_DAYS);

  // 存入本地缓存（使用较长 TTL，因为 API 层已有 60s 缓存）
  cache.set(cacheKey, salesMap, CACHE_TTL.LOW_FREQUENCY);
  log.info(`数据已缓存，共 ${salesMap.size} 条记录`);

  return salesMap;
}

/**
 * 获取库存汇总数据（通过 ERP 库存 API）
 * 返回 Map<goodsId, totalQuantity>
 */
export async function getStockSummaryMap(): Promise<Map<string, number>> {
  const cacheKey = CACHE_KEYS.STOCK_SUMMARY_MAP;

  // 检查本地缓存
  const cached = cache.get<Map<string, number>>(cacheKey);
  if (cached) {
    log.info('[getStockSummaryMap] 使用缓存数据');
    return cached;
  }

  log.info('[getStockSummaryMap] 缓存未命中，从 ERP API 获取...');

  // 从 ERP 库存 API 获取（API 层已有 30s 缓存）
  const apiMap = await getInventoryStockMap();

  // 转换为 string key Map（向后兼容）
  const stockMap = new Map<string, number>();
  apiMap.forEach((val: number, key: number) => stockMap.set(String(key), val));

  // 存入本地缓存（使用较长 TTL，因为 API 层已有 30s 缓存）
  cache.set(cacheKey, stockMap, CACHE_TTL.LOW_FREQUENCY);
  log.info(`[getStockSummaryMap] 数据已缓存，共 ${stockMap.size} 条记录`);

  return stockMap;
}

/**
 * 预热入口已迁移到 cache-warmup.service.ts（全局预热框架）
 * 此文件仅保留 getDailySalesMap / getStockSummaryMap / invalidatePrecomputedCache
 * 供其他模块调用
 */

/**
 * 清除预计算缓存
 * 当数据更新时调用
 */
export function invalidatePrecomputedCache(): void {
  cache.invalidate('daily_sales:');
  cache.invalidate('stock:summary:');
  log.info('[invalidatePrecomputedCache] 预计算缓存已清除');
}
