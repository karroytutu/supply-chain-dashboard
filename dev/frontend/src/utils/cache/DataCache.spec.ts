/**
 * DataCache 前端数据缓存单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataCache } from './DataCache';

// Mock logger
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

describe('DataCache', () => {
  let cache: DataCache;

  beforeEach(() => {
    cache = new DataCache();
  });

  describe('get/set', () => {
    it('写入后可以读取', () => {
      cache.set('key1', { value: 42 }, 60000);
      expect(cache.get('key1')).toEqual({ value: 42 });
    });

    it('未命中返回 null', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('过期后返回 null', () => {
      vi.useFakeTimers();
      cache.set('key1', 'data', 1000);

      vi.advanceTimersByTime(1500);
      expect(cache.get('key1')).toBeNull();

      vi.useRealTimers();
    });

    it('未过期时正常返回', () => {
      vi.useFakeTimers();
      cache.set('key1', 'data', 5000);

      vi.advanceTimersByTime(3000);
      expect(cache.get('key1')).toBe('data');

      vi.useRealTimers();
    });
  });

  describe('invalidate', () => {
    it('无参数时清除所有缓存', () => {
      cache.set('a', 1, 60000);
      cache.set('b', 2, 60000);

      cache.invalidate();
      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toBeNull();
    });

    it('按 pattern 清除匹配缓存', () => {
      cache.set('user:1', 'a', 60000);
      cache.set('user:2', 'b', 60000);
      cache.set('order:1', 'c', 60000);

      cache.invalidate('user:');
      expect(cache.get('user:1')).toBeNull();
      expect(cache.get('user:2')).toBeNull();
      expect(cache.get('order:1')).toBe('c');
    });
  });

  describe('getOrFetch', () => {
    it('缓存未命中时执行 fetcher', async () => {
      const fetcher = vi.fn().mockResolvedValue('fetched-data');

      const result = await cache.getOrFetch('key1', fetcher, 60000);
      expect(result).toBe('fetched-data');
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it('缓存命中时不执行 fetcher', async () => {
      cache.set('key1', 'cached', 60000);
      const fetcher = vi.fn().mockResolvedValue('new-data');

      const result = await cache.getOrFetch('key1', fetcher);
      expect(result).toBe('cached');
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('请求去重：并发请求只执行一次', async () => {
      let resolveFetcher: (v: string) => void;
      const fetcher = vi.fn().mockImplementation(
        () => new Promise<string>(resolve => { resolveFetcher = resolve; })
      );

      const p1 = cache.getOrFetch('key1', fetcher);
      const p2 = cache.getOrFetch('key1', fetcher);

      resolveFetcher!('data');
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1).toBe('data');
      expect(r2).toBe('data');
      expect(fetcher).toHaveBeenCalledOnce();
    });
  });

  describe('getStats', () => {
    it('返回缓存统计', () => {
      cache.set('a', 1, 60000);
      cache.set('b', 2, 60000);

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.keys).toContain('a');
      expect(stats.keys).toContain('b');
    });
  });

  describe('cleanup', () => {
    it('清理过期缓存', () => {
      vi.useFakeTimers();
      cache.set('expired', 'old', 500);
      cache.set('fresh', 'new', 60000);

      vi.advanceTimersByTime(1000);
      const cleaned = cache.cleanup();

      expect(cleaned).toBe(1);
      expect(cache.get('fresh')).toBe('new');

      vi.useRealTimers();
    });

    it('无过期缓存时返回 0', () => {
      cache.set('a', 1, 60000);
      expect(cache.cleanup()).toBe(0);
    });
  });
});
