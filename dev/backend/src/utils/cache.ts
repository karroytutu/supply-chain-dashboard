/**
 * 内存缓存模块
 * 用于缓存数据库查询结果，减少重复计算
 */
import { createLogger } from '../utils/logger';
const log = createLogger('Utils');

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class MemoryCache {
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
   * 获取缓存数据（含过期但未清理的数据）
   * 用于 stale-while-revalidate 模式：返回过期数据的同时后台刷新
   * 与 get() 的区别：过期条目不会被删除，仍然返回给调用方
   * @param key 缓存键
   * @returns 缓存数据，key 从未存储过则返回 null
   */
  getStale<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }
    return item.data as T;
  }

  /**
   * 获取缓存数据及其元数据（时间戳、TTL）
   * 用于数据新鲜度提示：前端可以显示“数据已存放多久”
   * @param key 缓存键
   * @returns { data, timestamp, ttl } 或 null（缓存未命中或已过期）
   */
  getWithMeta<T>(key: string): { data: T; timestamp: number; ttl: number } | null {
    const item = this.cache.get(key);
    if (!item || Date.now() - item.timestamp > item.ttl) {
      // 不删除过期条目，保留给 getStale() 实现 stale-while-revalidate
      // 过期条目由 cleanup() 定时器统一回收
      return null;
    }
    return { data: item.data as T, timestamp: item.timestamp, ttl: item.ttl };
  }

  /**
   * 检查缓存条目是否存在且未过期（非破坏性，不删除条目）
   * 配合 getStale() 实现 stale-while-revalidate：
   *   getStale() 获取值，isFresh() 判断新鲜度
   * @param key 缓存键
   * @returns true = 条目存在且未过期；false = 条目不存在或已过期
   */
  isFresh(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    return Date.now() - item.timestamp <= item.ttl;
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
      log.warn(`清理了 ${cleanedCount} 条过期缓存，可能需要增大 TTL 或减少缓存频率`);
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

// 缓存时间常量（毫秒）- 分层策略
export const CACHE_TTL = {
  /** 高频变更数据：权限、预警列表（30秒） */
  HIGH_FREQUENCY: 30 * 1000,
  /** 常规业务数据：仪表盘、概览统计（60秒） */
  DASHBOARD: 60 * 1000,
  /** 低频变更数据：品类、战略商品（5分钟） */
  LOW_FREQUENCY: 5 * 60 * 1000,
  /** ERP 基础数据集：欠款、库存、批次库存（3分钟）—— 配合定时预热使用 */
  ERP_BASE: 3 * 60 * 1000,
  /** ERP 低频数据集：商品档案、销售明细（5分钟）—— 变化缓慢，配合定时预热 */
  ERP_SLOW: 5 * 60 * 1000,
  /** 客户档案：名称映射、限额配置（10分钟）—— 极少变化 */
  ERP_CUSTOMER: 10 * 60 * 1000,
};
