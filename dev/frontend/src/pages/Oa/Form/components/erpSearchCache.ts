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

/** 后端支持关键词过滤的 ERP 类型（走服务端搜索，防抖 300ms） */
export const SERVER_KEYWORD_TYPES = new Set(['assets', 'customers', 'settlement-orders']);

/** 最小搜索关键词长度（仅适用于服务端关键词类型） */
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

/** 构造缓存键：服务端类型包含 keyword，客户端类型不包含（只缓存全量） */
export function buildCacheKey(
  erpType: string, keyword?: string,
  cascadePart?: string, statePart?: string
): string {
  const kw = SERVER_KEYWORD_TYPES.has(erpType) ? (keyword || '') : '';
  return `${erpType}:${kw}${cascadePart || ''}${statePart || ''}`;
}

/** 写入缓存（自动 LRU 淘汰） */
export function setCachedOptions(cacheKey: string, data: Array<{ label: string; value: unknown; raw: unknown }>) {
  if (erpSearchCache.size >= ERP_SEARCH_CACHE_MAX) {
    const firstKey = erpSearchCache.keys().next().value;
    if (firstKey !== undefined) erpSearchCache.delete(firstKey);
  }
  erpSearchCache.set(cacheKey, { data, timestamp: Date.now() });
}
