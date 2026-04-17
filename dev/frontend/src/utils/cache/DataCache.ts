/**
 * 数据缓存类
 * 支持缓存过期、请求去重
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

class DataCache {
  private cache = new Map<string, CacheItem<any>>();
  private pendingRequests = new Map<string, PendingRequest<any>>();

  /**
   * 获取缓存数据
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    // 检查是否过期
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
  }

  /**
   * 设置缓存数据
   */
  set<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * 使缓存失效
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    // 按模式删除缓存
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 获取缓存或执行请求（带请求去重）
   * 如果缓存存在且未过期，返回缓存数据
   * 如果有正在进行的相同请求，返回该请求的 Promise
   * 否则执行 fetcher 并缓存结果
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 60 * 1000 // 默认 1 分钟
  ): Promise<T> {
    // 1. 检查缓存
    const cached = this.get<T>(key);
    if (cached !== null) {
      console.log(`[DataCache] 缓存命中: ${key}`);
      return cached;
    }

    // 2. 检查是否有正在进行的请求
    const pending = this.pendingRequests.get(key);
    if (pending) {
      // 如果请求时间超过 30 秒，可能是超时了，重新发起新请求
      if (Date.now() - pending.timestamp < 30 * 1000) {
        console.log(`[DataCache] 复用进行中的请求: ${key}`);
        return pending.promise;
      }
      this.pendingRequests.delete(key);
    }

    // 3. 发起新请求
    console.log(`[DataCache] 发起新请求: ${key}`);
    const promise = fetcher();
    this.pendingRequests.set(key, { promise, timestamp: Date.now() });

    try {
      const result = await promise;
      // 缓存结果
      this.set(key, result, ttl);
      return result;
    } finally {
      // 清理 pending 状态
      this.pendingRequests.delete(key);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; keys: string[]; pendingCount: number } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      pendingCount: this.pendingRequests.size,
    };
  }

  /**
   * 清理过期缓存
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    // 清理超时的 pending 请求
    for (const [key, pending] of this.pendingRequests.entries()) {
      if (now - pending.timestamp > 30 * 1000) {
        this.pendingRequests.delete(key);
      }
    }

    return cleaned;
  }
}

export { DataCache };
