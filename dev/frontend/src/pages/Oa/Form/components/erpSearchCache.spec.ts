/**
 * ERP 搜索结果缓存单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCachedOptions,
  setCachedOptions,
  ERP_SEARCH_CACHE_MAX,
  ERP_SEARCH_CACHE_TTL,
  SERVER_KEYWORD_TYPES,
  MIN_SEARCH_LENGTH,
  buildCacheKey,
} from './erpSearchCache';

describe('erpSearchCache', () => {
  beforeEach(() => {
    // 清空缓存（通过设置大量条目然后清除）
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('写入后可以读取', () => {
    const data = [{ label: 'A', value: 1, raw: {} }];
    setCachedOptions('test-key', data);

    const result = getCachedOptions('test-key');
    expect(result).toEqual(data);
  });

  it('未命中返回 null', () => {
    const result = getCachedOptions('nonexistent');
    expect(result).toBeNull();
  });

  it('过期条目返回 null 并清除', () => {
    const data = [{ label: 'B', value: 2, raw: {} }];
    setCachedOptions('expire-test', data);

    // 快进超过 TTL
    vi.advanceTimersByTime(ERP_SEARCH_CACHE_TTL + 1000);

    const result = getCachedOptions('expire-test');
    expect(result).toBeNull();
  });

  it('LRU 淘汰：超过最大条目时删除最早条目', () => {
    // 填满缓存
    for (let i = 0; i < ERP_SEARCH_CACHE_MAX; i++) {
      setCachedOptions(`key-${i}`, [{ label: `${i}`, value: i, raw: {} }]);
    }

    // 第一条应该还在
    expect(getCachedOptions('key-0')).not.toBeNull();

    // 添加新条目，触发淘汰
    setCachedOptions('new-key', [{ label: 'new', value: 'new', raw: {} }]);

    // key-0 应该被淘汰
    expect(getCachedOptions('key-0')).toBeNull();
    expect(getCachedOptions('new-key')).not.toBeNull();
  });
});

describe('常量', () => {
  it('SERVER_KEYWORD_TYPES 包含 assets、customers、settlement-orders', () => {
    expect(SERVER_KEYWORD_TYPES.has('assets')).toBe(true);
    expect(SERVER_KEYWORD_TYPES.has('customers')).toBe(true);
    expect(SERVER_KEYWORD_TYPES.has('settlement-orders')).toBe(true);
    expect(SERVER_KEYWORD_TYPES.has('suppliers')).toBe(false);
    expect(SERVER_KEYWORD_TYPES.has('departments')).toBe(false);
  });

  it('buildCacheKey 服务端类型包含 keyword，客户端类型不包含', () => {
    // 服务端类型：keyword 写入缓存键
    expect(buildCacheKey('assets', 'abc')).toBe('assets:abc');
    expect(buildCacheKey('customers', 'abc')).toBe('customers:abc');
    // 客户端类型：keyword 不写入缓存键（只缓存全量）
    expect(buildCacheKey('suppliers', 'abc')).toBe('suppliers:');
    expect(buildCacheKey('suppliers')).toBe('suppliers:');
    // 级联和状态参数
    expect(buildCacheKey('settlement-orders', 'test', ':cid=123')).toBe('settlement-orders:test:cid=123');
    expect(buildCacheKey('customers', '', '', ':all')).toBe('customers::all');
    expect(buildCacheKey('suppliers', 'abc', '', ':all')).toBe('suppliers::all');
  });

  it('MIN_SEARCH_LENGTH 为 2', () => {
    expect(MIN_SEARCH_LENGTH).toBe(2);
  });

  it('缓存 TTL 为 5 分钟', () => {
    expect(ERP_SEARCH_CACHE_TTL).toBe(5 * 60 * 1000);
  });

  it('最大缓存条目数为 50', () => {
    expect(ERP_SEARCH_CACHE_MAX).toBe(50);
  });
});
