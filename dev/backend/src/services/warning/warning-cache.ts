/**
 * 预警服务缓存管理
 */

import { appQuery } from '../../db/appPool';

// 缓存战略商品 ID 集合
let strategicGoodsIdsCache: Set<string> | null = null;
let strategicGoodsIdsCacheTime = 0;
const STRATEGIC_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 获取已确认的战略商品 ID 集合
 */
export async function getStrategicGoodsIds(): Promise<Set<string>> {
  const now = Date.now();
  if (strategicGoodsIdsCache && (now - strategicGoodsIdsCacheTime) < STRATEGIC_CACHE_TTL) {
    return strategicGoodsIdsCache;
  }

  try {
    const result = await appQuery<{ goods_id: string }>(`
      SELECT goods_id FROM strategic_products
      WHERE status = 'confirmed' AND confirmed_at IS NOT NULL
    `);
    strategicGoodsIdsCache = new Set(result.rows.map(r => r.goods_id));
    strategicGoodsIdsCacheTime = now;
    return strategicGoodsIdsCache;
  } catch (error) {
    console.error('获取战略商品列表失败:', error);
    return new Set();
  }
}

/**
 * 清除战略商品缓存
 */
export function clearStrategicGoodsCache(): void {
  strategicGoodsIdsCache = null;
  strategicGoodsIdsCacheTime = 0;
}
