/**
 * 数据缓存模块入口
 * 导出单例实例和常量
 */
import { DataCache } from './DataCache';
import { CACHE_KEYS, CACHE_TTL } from './constants';

/** 缓存单例实例 */
export const dataCache = new DataCache();

export { CACHE_KEYS, CACHE_TTL };

// 定期清理过期缓存（每 5 分钟）
if (typeof window !== 'undefined') {
  setInterval(() => {
    dataCache.cleanup();
  }, 5 * 60 * 1000);
}
