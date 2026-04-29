/**
 * ERP 搜索结果客户端缓存
 * 模块级缓存，5分钟 TTL，避免重复请求同一关键词
 */

interface CacheEntry {
  data: Array<{ label: string; value: unknown; raw: unknown }>;
  timestamp: number;
}

const erpSearchCache = new Map<string, CacheEntry>();

/** 最大缓存条目数 */
export const ERP_SEARCH_CACHE_MAX = 50;

/** 缓存 TTL（5分钟，与后端缓存 TTL 对齐） */
export const ERP_SEARCH_CACHE_TTL = 5 * 60 * 1000;

/** 需要防抖搜索 + 最小长度的 ERP 类型 */
export const DEBOUNCED_SEARCH_TYPES = new Set(['assets', 'customers']);

/** 最小搜索关键词长度 */
export const MIN_SEARCH_LENGTH = 2;

/** 从缓存获取数据（未命中返回 null） */
export function getCachedOptions(cacheKey: string): Array<{ label: string; value: unknown; raw: unknown }> | null {
  const cached = erpSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < ERP_SEARCH_CACHE_TTL) {
    return cached.data;
  }
  if (cached) {
    erpSearchCache.delete(cacheKey); // 过期条目清除
  }
  return null;
}

/** 写入缓存（自动 LRU 淘汰） */
export function setCachedOptions(cacheKey: string, data: Array<{ label: string; value: unknown; raw: unknown }>) {
  if (erpSearchCache.size >= ERP_SEARCH_CACHE_MAX) {
    const firstKey = erpSearchCache.keys().next().value;
    if (firstKey !== undefined) erpSearchCache.delete(firstKey);
  }
  erpSearchCache.set(cacheKey, { data, timestamp: Date.now() });
}
