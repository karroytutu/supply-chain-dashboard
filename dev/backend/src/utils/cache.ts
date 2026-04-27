/**
 * 内存缓存模块
 * 用于缓存数据库查询结果，减少重复计算
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class MemoryCache {
  private cache = new Map<string, CacheItem<any>>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    // 每5分钟清理过期缓存
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * 获取缓存数据
   * @param key 缓存键
   * @returns 缓存数据，不存在或已过期返回 null
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item || Date.now() - item.timestamp > item.ttl) {
      if (item) {
        this.cache.delete(key);
      }
      return null;
    }
    return item.data as T;
  }

  /**
   * 设置缓存数据
   * @param key 缓存键
   * @param data 缓存数据
   * @param ttl 缓存有效期（毫秒）
   */
  set<T>(key: string, data: T, ttl: number): void {
    // 容量检查：超过上限时删除最早的条目
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * 使缓存失效
   * @param pattern 缓存键模式（可选），不传则清空所有缓存
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    if (cleanedCount > 100) {
      console.warn(`[Cache] 清理了 ${cleanedCount} 条过期缓存，可能需要增大 TTL 或减少缓存频率`);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * 销毁缓存实例
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// 导出单例实例
export const cache = new MemoryCache();

// 缓存时间常量（毫秒）- 三档分层
export const CACHE_TTL = {
  /** 高频变更数据：权限、预警列表（30秒） */
  HIGH_FREQUENCY: 30 * 1000,
  /** 常规业务数据：仪表盘、概览统计（60秒） */
  DASHBOARD: 60 * 1000,
  /** 低频变更数据：品类、ERP、战略商品（5分钟） */
  LOW_FREQUENCY: 5 * 60 * 1000,

  // ---- 旧名称别名（@deprecated，请使用上方三档常量）----
  /** @deprecated 使用 HIGH_FREQUENCY */
  WARNING_LIST: 30 * 1000,
  /** @deprecated 使用 LOW_FREQUENCY */
  CATEGORY_STATS: 5 * 60 * 1000,
  /** @deprecated 使用 LOW_FREQUENCY */
  ERP_CUSTOMER_SEARCH: 5 * 60 * 1000,
  /** @deprecated 使用 LOW_FREQUENCY */
  ERP_CUSTOMER_PROFILE: 5 * 60 * 1000,
};
