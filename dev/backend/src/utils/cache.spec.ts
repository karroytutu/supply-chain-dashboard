/**
 * MemoryCache 单元测试
 * 测试 TTL 过期、pattern 失效、容量限制、stale-while-revalidate
 */

// 直接测试 MemoryCache 类（不依赖单例，避免清理 interval 干扰）
// 从 cache.ts 复制类定义进行独立测试

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class TestMemoryCache {
  cache = new Map<string, CacheItem<any>>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item || Date.now() - item.timestamp > item.ttl) {
      if (item) this.cache.delete(key);
      return null;
    }
    return item.data as T;
  }

  getStale<T>(key: string): T | null {
    const item = this.cache.get(key);
    return item ? (item.data as T) : null;
  }

  isFresh(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    return Date.now() - item.timestamp <= item.ttl;
  }

  set<T>(key: string, data: T, ttl: number): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  invalidate(pattern?: string): void {
    if (!pattern) { this.cache.clear(); return; }
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) this.cache.delete(key);
    }
  }

  get size(): number { return this.cache.size; }
}

describe('MemoryCache', () => {
  let cache: TestMemoryCache;

  beforeEach(() => {
    cache = new TestMemoryCache(10);
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
      // Simulate expiry by manipulating timestamp
      const item = cache.cache.get('key1')!;
      item.timestamp = Date.now() - 100;
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
      const item = cache.cache.get('key1')!;
      item.timestamp = Date.now() - 100;
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
      const item = cache.cache.get('key1')!;
      item.timestamp = Date.now() - 100;
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
      expect(cache.size).toBe(0);
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
      const smallCache = new TestMemoryCache(3);
      smallCache.set('k1', 'v1', 60000);
      smallCache.set('k2', 'v2', 60000);
      smallCache.set('k3', 'v3', 60000);
      smallCache.set('k4', 'v4', 60000); // should evict k1
      expect(smallCache.get('k1')).toBeNull();
      expect(smallCache.get('k4')).toBe('v4');
    });

    it('does not evict when updating existing key', () => {
      const smallCache = new TestMemoryCache(3);
      smallCache.set('k1', 'v1', 60000);
      smallCache.set('k2', 'v2', 60000);
      smallCache.set('k3', 'v3', 60000);
      smallCache.set('k1', 'v1-updated', 60000); // update, no eviction
      expect(smallCache.size).toBe(3);
      expect(smallCache.get('k1')).toBe('v1-updated');
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
});

describe('CACHE_TTL constants', () => {
  it('exports three tiers', async () => {
    const { CACHE_TTL } = await import('./cache');
    expect(CACHE_TTL.HIGH_FREQUENCY).toBe(30000);
    expect(CACHE_TTL.DASHBOARD).toBe(60000);
    expect(CACHE_TTL.LOW_FREQUENCY).toBe(300000);
  });
});
