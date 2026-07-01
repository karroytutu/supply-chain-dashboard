/**
 * 目标管理 Repository 单元测试
 * @module services/sales-target/sales-target.repository.spec.ts
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));

jest.mock('../../utils/cache', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  },
  CACHE_TTL: { DASHBOARD: 60000, HIGH_FREQUENCY: 30000, LOW_FREQUENCY: 300000 },
}));

import {
  listTargets,
  getTargetById,
  getTargetItems,
  createTarget,
  updateTargetItems,
  deleteTarget,
} from './sales-target.repository';
import { appQuery, getAppClient } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetAppClient = getAppClient as jest.MockedFunction<typeof getAppClient>;
const mockCache = cache as jest.Mocked<typeof cache>;

// =====================================================
// 测试辅助
// =====================================================

function createMockClient() {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes('INSERT INTO sales_targets') && sql.includes('RETURNING')) {
        return { rows: [{ id: 1, marketer_id: 100, year: 2026, month: 7 }], rowCount: 1 };
      }
      if (sql.startsWith('INSERT')) return { rowCount: 1 };
      if (sql.startsWith('DELETE')) return { rowCount: 1 };
      if (sql.startsWith('UPDATE')) return { rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
    _queries: queries,
  };
  return client;
}

const sampleItems = [
  {
    erp_consumer_id: 1001, consumer_name: '客户A', is_planned_new: false,
    erp_goods_id: 101, goods_name: '商品A', category_name: '品类1',
    unit: '箱', unit_price: 10, target_amount: 500, remark: '',
  },
  {
    erp_consumer_id: 1001, consumer_name: '客户A', is_planned_new: false,
    erp_goods_id: 102, goods_name: '商品B', category_name: '品类1',
    unit: '箱', unit_price: 20, target_amount: 300, remark: '',
  },
];

// =====================================================
// listTargets
// =====================================================

describe('listTargets', () => {
  beforeEach(() => jest.clearAllMocks());

  it('无过滤条件时查询全部目标，按年月降序', async () => {
    const rows = [{ id: 1, marketer_id: 100, marketer_name: '张三', year: 2026, month: 7 }];
    mockAppQuery.mockResolvedValue({ rows } as any);

    const result = await listTargets({});

    expect(result).toEqual(rows);
    const sql = (mockAppQuery as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain('sales_targets');
    expect(sql).toContain('ORDER BY t.year DESC, t.month DESC');
    // 无 WHERE 条件
    expect(sql).not.toContain('WHERE');
  });

  it('按 marketer_id 过滤', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] } as any);

    await listTargets({ marketer_id: 100 });

    const [sql, params] = (mockAppQuery as jest.Mock).mock.calls[0];
    expect(sql).toContain('t.marketer_id = $1');
    expect(params).toEqual([100]);
  });

  it('按 year+month 过滤 → WHERE 条件叠加', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] } as any);

    await listTargets({ year: 2026, month: 7 });

    const [sql, params] = (mockAppQuery as jest.Mock).mock.calls[0];
    expect(sql).toContain('t.year = $1');
    expect(sql).toContain('t.month = $2');
    expect(params).toEqual([2026, 7]);
  });
});

// =====================================================
// getTargetById
// =====================================================

describe('getTargetById', () => {
  beforeEach(() => jest.clearAllMocks());

  it('存在时返回含 marketer_name 的记录', async () => {
    const row = { id: 1, marketer_id: 100, marketer_name: '张三' };
    mockAppQuery.mockResolvedValue({ rows: [row] } as any);

    const result = await getTargetById(1);
    expect(result).toEqual(row);
    const [sql, params] = (mockAppQuery as jest.Mock).mock.calls[0];
    expect(sql).toContain('WHERE t.id = $1');
    expect(params).toEqual([1]);
  });

  it('不存在时返回 null', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] } as any);

    const result = await getTargetById(999);
    expect(result).toBeNull();
  });
});

// =====================================================
// getTargetItems
// =====================================================

describe('getTargetItems', () => {
  beforeEach(() => jest.clearAllMocks());

  it('缓存命中时直接返回缓存数据，不查 DB', async () => {
    const cachedItems = [{ id: 1, target_id: 1, goods_name: '商品A' }];
    mockCache.get.mockReturnValue(cachedItems as any);

    const result = await getTargetItems(1);

    expect(result).toEqual(cachedItems);
    expect(mockAppQuery).not.toHaveBeenCalled();
  });

  it('缓存未命中时查询 DB 并写入缓存', async () => {
    mockCache.get.mockReturnValue(null);
    const rows = [{ id: 1, target_id: 1, goods_name: '商品A' }];
    mockAppQuery.mockResolvedValue({ rows } as any);

    const result = await getTargetItems(1);

    expect(result).toEqual(rows);
    expect(mockAppQuery).toHaveBeenCalledTimes(1);
    const [sql] = (mockAppQuery as jest.Mock).mock.calls[0];
    expect(sql).toContain('sales_target_items');
    expect(sql).toContain('ORDER BY consumer_name, category_name, goods_name');
    // 验证缓存写入
    expect(mockCache.set).toHaveBeenCalledWith(
      'sales:target:items:1',
      rows,
      CACHE_TTL.DASHBOARD
    );
  });
});

// =====================================================
// createTarget
// =====================================================

describe('createTarget', () => {
  beforeEach(() => jest.clearAllMocks());

  it('事务序列：BEGIN → INSERT targets → DELETE items → INSERT items → COMMIT', async () => {
    const mockClient = createMockClient();
    mockGetAppClient.mockResolvedValue(mockClient as any);

    const result = await createTarget({
      marketer_id: 100, year: 2026, month: 7, items: sampleItems,
    });

    expect(result).toEqual({ id: 1, marketer_id: 100, year: 2026, month: 7 });
    const sqls = mockClient._queries.map(q => q.sql);

    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toContain('INSERT INTO sales_targets');
    expect(sqls[1]).toContain('ON CONFLICT');
    expect(sqls[1]).toContain('RETURNING');
    expect(sqls[2]).toContain('DELETE FROM sales_target_items');
    expect(sqls[3]).toContain('INSERT INTO sales_target_items');
    expect(sqls[4]).toBe('COMMIT');
    // 验证 client.release 被调用
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('items 为空数组时只创建主表记录，跳过 INSERT items', async () => {
    const mockClient = createMockClient();
    mockGetAppClient.mockResolvedValue(mockClient as any);

    await createTarget({ marketer_id: 100, year: 2026, month: 7, items: [] });

    const sqls = mockClient._queries.map(q => q.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toContain('INSERT INTO sales_targets');
    expect(sqls[2]).toContain('DELETE FROM sales_target_items');
    // 不应有 INSERT INTO sales_target_items
    const itemInsert = sqls.find(s => s.includes('INSERT INTO sales_target_items'));
    expect(itemInsert).toBeUndefined();
    expect(sqls[3]).toBe('COMMIT');
  });

  it('INSERT 失败时 ROLLBACK + re-throw', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('UNIQUE violation')) // INSERT targets 失败
        .mockResolvedValue({ rows: [] }), // ROLLBACK + subsequent
      release: jest.fn(),
    };
    mockGetAppClient.mockResolvedValue(mockClient as any);

    await expect(createTarget({
      marketer_id: 100, year: 2026, month: 7, items: [],
    })).rejects.toThrow('UNIQUE violation');

    // 验证 ROLLBACK 被调用
    const rollbackCall = mockClient.query.mock.calls.find(
      ([sql]: [string]) => sql === 'ROLLBACK'
    );
    expect(rollbackCall).toBeDefined();
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('成功后调用 invalidateTargetCache', async () => {
    const mockClient = createMockClient();
    mockGetAppClient.mockResolvedValue(mockClient as any);

    await createTarget({ marketer_id: 100, year: 2026, month: 7, items: sampleItems });

    expect(mockCache.invalidate).toHaveBeenCalledWith('sales:target:');
  });
});

// =====================================================
// updateTargetItems
// =====================================================

describe('updateTargetItems', () => {
  beforeEach(() => jest.clearAllMocks());

  it('事务中 UPDATE updated_at + DELETE items + INSERT items + COMMIT', async () => {
    const mockClient = createMockClient();
    mockGetAppClient.mockResolvedValue(mockClient as any);

    await updateTargetItems(1, sampleItems);

    const sqls = mockClient._queries.map(q => q.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toContain('UPDATE sales_targets SET updated_at');
    expect(sqls[2]).toContain('DELETE FROM sales_target_items');
    expect(sqls[3]).toContain('INSERT INTO sales_target_items');
    expect(sqls[4]).toBe('COMMIT');
    expect(mockCache.invalidate).toHaveBeenCalledWith('sales:target:');
  });

  it('items 为空数组时清空明细', async () => {
    const mockClient = createMockClient();
    mockGetAppClient.mockResolvedValue(mockClient as any);

    await updateTargetItems(1, []);

    const sqls = mockClient._queries.map(q => q.sql);
    expect(sqls[2]).toContain('DELETE FROM sales_target_items');
    const itemInsert = sqls.find(s => s.includes('INSERT INTO sales_target_items'));
    expect(itemInsert).toBeUndefined();
  });

  it('失败时 ROLLBACK', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
        .mockRejectedValueOnce(new Error('INSERT fail')), // DELETE fail
      release: jest.fn(),
    };
    // 后续的 ROLLBACK 调用使用默认 resolve
    mockClient.query.mockResolvedValue({ rows: [] });
    mockGetAppClient.mockResolvedValue(mockClient as any);

    await expect(updateTargetItems(1, sampleItems)).rejects.toThrow('INSERT fail');

    const rollbackCall = mockClient.query.mock.calls.find(
      ([sql]: [string]) => sql === 'ROLLBACK'
    );
    expect(rollbackCall).toBeDefined();
  });
});

// =====================================================
// deleteTarget
// =====================================================

describe('deleteTarget', () => {
  beforeEach(() => jest.clearAllMocks());

  it('DELETE 主表 + 失效缓存', async () => {
    mockAppQuery.mockResolvedValue({ rowCount: 1 } as any);

    await deleteTarget(1);

    const [sql, params] = (mockAppQuery as jest.Mock).mock.calls[0];
    expect(sql).toContain('DELETE FROM sales_targets WHERE id = $1');
    expect(params).toEqual([1]);
    expect(mockCache.invalidate).toHaveBeenCalledWith('sales:target:');
  });
});
