/**
 * 预警服务缓存管理
 * 使用统一 MemoryCache 管理战略商品 ID 缓存
 */

import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';

/** 战略商品缓存 key 前缀 */
const STRATEGIC_PRODUCT_CACHE_KEY = CACHE_KEY.STRATEGIC_PRODUCT_IDS;

/**
 * 获取已确认的战略商品 ID 集合
 */
export async function getStrategicGoodsIds(): Promise<Set<string>> {
  const cached = cache.get<Set<string>>(STRATEGIC_PRODUCT_CACHE_KEY);
  if (cached) return cached;

  try {
    const result = await appQuery<{ goods_id: string }>(`
      SELECT goods_id FROM strategic_products
      WHERE status = 'confirmed' AND confirmed_at IS NOT NULL
    `);
    const ids = new Set(result.rows.map(r => r.goods_id));
    cache.set(STRATEGIC_PRODUCT_CACHE_KEY, ids, CACHE_TTL.LOW_FREQUENCY);
    return ids;
  } catch (error) {
    console.error('获取战略商品列表失败:', error);
    return new Set();
  }
}

/**
 * 清除战略商品缓存
 */
export function clearStrategicGoodsCache(): void {
  cache.invalidate(STRATEGIC_PRODUCT_CACHE_KEY);
}
