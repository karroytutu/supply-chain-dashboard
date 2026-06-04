/**
 * MemoryCache 单元测试
 * 测试 TTL 过期、pattern 失效、容量限制、stale-while-revalidate
 * 直接使用真实 MemoryCache 类，通过 jest.useFakeTimers() 消除 setInterval 副作用
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  }),
}));

import { MemoryCache, CACHE_TTL } from './cache';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new MemoryCache(10);
  });

  afterEach(() => {
    cache.destroy();
    jest.useRealTimers();
  });

  describe('get/set', () => {
    it('stores and retrieves data', () => {
      cache.set('key1', 'value1', 60000);
      expect(cache.get('key1')).toBe('value1');
    });

    it('returns null for non-existent key', () => {
      expect(cache.get('missing')).toBeNull();
    });

    it('returns null for expired key', () => {
      cache.set('key1', 'value1', 1); // 1ms TTL
      jest.advanceTimersByTime(10);    // 前进 10ms，超过 1ms TTL
      expect(cache.get('key1')).toBeNull();
    });

    it('overwrites existing key', () => {
      cache.set('key1', 'v1', 60000);
      cache.set('key1', 'v2', 60000);
      expect(cache.get('key1')).toBe('v2');
    });
  });

  describe('getStale', () => {
    it('returns data even when expired', () => {
      cache.set('key1', 'value1', 1);
      jest.advanceTimersByTime(10);
      // getStale 返回过期但未清理的数据
      expect(cache.getStale('key1')).toBe('value1');
    });

    it('returns null for never-stored key', () => {
      expect(cache.getStale('missing')).toBeNull();
    });
  });

  describe('isFresh', () => {
    it('returns true for fresh data', () => {
      cache.set('key1', 'value1', 60000);
      expect(cache.isFresh('key1')).toBe(true);
    });

    it('returns false for expired data', () => {
      cache.set('key1', 'value1', 1);
      jest.advanceTimersByTime(10);
      expect(cache.isFresh('key1')).toBe(false);
    });

    it('returns false for missing key', () => {
      expect(cache.isFresh('missing')).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('clears all cache when no pattern', () => {
      cache.set('a:1', 'v1', 60000);
      cache.set('b:1', 'v2', 60000);
      cache.invalidate();
      expect(cache.getStats().size).toBe(0);
    });

    it('clears matching pattern only', () => {
      cache.set('ar:collection:tasks', 'v1', 60000);
      cache.set('ar:collection:stats', 'v2', 60000);
      cache.set('strategic:product:ids', 'v3', 60000);
      cache.invalidate('ar:collection:');
      expect(cache.get('ar:collection:tasks')).toBeNull();
      expect(cache.get('ar:collection:stats')).toBeNull();
      expect(cache.get('strategic:product:ids')).toBe('v3');
    });
  });

  describe('maxSize', () => {
    it('evicts oldest entry when max size reached', () => {
      const smallCache = new MemoryCache(3);
      smallCache.set('k1', 'v1', 60000);
      smallCache.set('k2', 'v2', 60000);
      smallCache.set('k3', 'v3', 60000);
      smallCache.set('k4', 'v4', 60000); // should evict k1
      expect(smallCache.get('k1')).toBeNull();
      expect(smallCache.get('k4')).toBe('v4');
      smallCache.destroy();
    });

    it('does not evict when updating existing key', () => {
      const smallCache = new MemoryCache(3);
      smallCache.set('k1', 'v1', 60000);
      smallCache.set('k2', 'v2', 60000);
      smallCache.set('k3', 'v3', 60000);
      smallCache.set('k1', 'v1-updated', 60000); // update, no eviction
      expect(smallCache.getStats().size).toBe(3);
      expect(smallCache.get('k1')).toBe('v1-updated');
      smallCache.destroy();
    });
  });

  describe('data types', () => {
    it('stores objects', () => {
      const obj = { name: 'test', count: 42 };
      cache.set('obj', obj, 60000);
      expect(cache.get('obj')).toEqual(obj);
    });

    it('stores arrays', () => {
      const arr = [1, 2, 3];
      cache.set('arr', arr, 60000);
      expect(cache.get('arr')).toEqual(arr);
    });

    it('stores numbers and booleans', () => {
      cache.set('num', 42, 60000);
      cache.set('bool', true, 60000);
      expect(cache.get('num')).toBe(42);
      expect(cache.get('bool')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('returns current size and keys', () => {
      cache.set('a', 'v1', 60000);
      cache.set('b', 'v2', 60000);
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.keys).toEqual(expect.arrayContaining(['a', 'b']));
    });

    it('returns empty stats for empty cache', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.keys).toEqual([]);
    });
  });

  describe('destroy', () => {
    it('clears all data and stops interval', () => {
      cache.set('a', 'v1', 60000);
      cache.set('b', 'v2', 60000);
      cache.destroy();
      expect(cache.getStats().size).toBe(0);
      expect(cache.get('a')).toBeNull();
    });
  });
});

describe('CACHE_TTL constants', () => {
  it('exports three tiers', () => {
    expect(CACHE_TTL.HIGH_FREQUENCY).toBe(30000);
    expect(CACHE_TTL.DASHBOARD).toBe(60000);
    expect(CACHE_TTL.LOW_FREQUENCY).toBe(300000);
  });
});
