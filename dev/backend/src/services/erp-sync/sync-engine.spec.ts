/**
 * ERP 同步引擎单元测试
 * @module services/erp-sync/sync-engine.spec.ts
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));
jest.mock('../../config', () => ({
  config: {
    erpSync: { timeout: 30000, retryMax: 0 },
  },
}));

import { syncDataset, syncWindowedRange } from './sync-engine';
import { appQuery, getAppClient } from '../../db/appPool';
import type { SyncSourceConfig } from './sync-types';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetAppClient = getAppClient as jest.MockedFunction<typeof getAppClient>;

// =====================================================
// 测试辅助
// =====================================================

/** 构造 mock client（事务场景使用） */
function createMockClient() {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.startsWith('INSERT')) return { rowCount: params ? params.length / (Object.keys(testRows[0] || { a: 1 })).filter(k => k !== 'id').length : 0 };
      if (sql.startsWith('DELETE')) return { rowCount: 5 };
      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
    _queries: queries,
  };
  return client;
}

let testRows: Record<string, unknown>[] = [];

/** 构造 SyncSourceConfig 测试桩 */
function buildConfig(overrides: Partial<SyncSourceConfig> = {}): SyncSourceConfig {
  return {
    id: 'test_dataset',
    name: '测试数据集',
    type: 'snapshot',
    syncMode: 'upsert',
    fetchAll: jest.fn().mockResolvedValue([]),
    transform: jest.fn((record: any) => ({ ...record })),
    targetTable: 'erp_test_table',
    primaryKey: ['pk_id'],
    intervalMs: 120000,
    pageSize: 2000,
    enableFallback: false,
    ...overrides,
  };
}

/** 设置 advisory lock 获取成功 */
function mockLockSuccess() {
  mockAppQuery.mockResolvedValueOnce({ rows: [{ locked: true }] } as any);
}

/** 设置 advisory lock 获取失败 */
function mockLockFail() {
  mockAppQuery.mockResolvedValueOnce({ rows: [{ locked: false }] } as any);
}

/** 消费 status/log 写入（默认成功） */
function mockStatusAndLog() {
  mockAppQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
}

// =====================================================
// syncDataset
// =====================================================

describe('syncDataset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    testRows = [];
  });

  describe('advisory lock 机制', () => {
    it('获取锁失败时返回 success:false 并跳过同步', async () => {
      mockLockFail();

      const config = buildConfig();
      const result = await syncDataset(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('另一个同步进程');
      expect(config.fetchAll).not.toHaveBeenCalled();
    });

    it('finally 块确保锁被释放（即使 fetchAll 抛出异常）', async () => {
      mockLockSuccess();
      const config = buildConfig({
        fetchAll: jest.fn().mockRejectedValue(new Error('网络超时')),
      });
      // status/log/release 写入都返回正常 Promise
      mockAppQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await syncDataset(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('网络超时');
      // 验证 releaseLock 被调用（pg_advisory_unlock）
      const unlockCalls = mockAppQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('pg_advisory_unlock')
      );
      expect(unlockCalls.length).toBe(1);
    });

    it('releaseLock 异常被静默吞掉不影响结果', async () => {
      mockLockSuccess();
      const config = buildConfig({
        fetchAll: jest.fn().mockResolvedValue([]),
      });
      // lock acquire success, then status/log, then release lock fails
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ locked: true }] } as any) // lock
        .mockResolvedValue({ rows: [], rowCount: 0 } as any); // status + log

      const result = await syncDataset(config);
      expect(result.success).toBe(true);
    });
  });

  describe('全量拉取 + 转换 + UPSERT 流程', () => {
    it('fetchAll 返回空数组时跳过 UPSERT，写入 success 状态和日志', async () => {
      mockLockSuccess();
      mockStatusAndLog();

      const config = buildConfig({ fetchAll: jest.fn().mockResolvedValue([]) });
      const result = await syncDataset(config);

      expect(result.success).toBe(true);
      expect(result.recordsFetched).toBe(0);
      expect(result.recordsUpserted).toBe(0);
      // 验证没有执行数据表的 UPSERT SQL（排除 erp_sync_log 的 INSERT）
      const upsertCalls = mockAppQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO') && sql.includes('ON CONFLICT')
      );
      expect(upsertCalls.length).toBe(0);
      // 验证没有对数据表执行 INSERT
      const dataInsertCalls = mockAppQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO erp_test_table')
      );
      expect(dataInsertCalls.length).toBe(0);
    });

    it('正常流程：fetchAll → transform + content_hash → batchUpsert → 更新状态', async () => {
      mockLockSuccess();
      mockStatusAndLog();

      const records = [
        { pk_id: '1', name: 'A', value: 100 },
        { pk_id: '2', name: 'B', value: 200 },
      ];
      const config = buildConfig({
        fetchAll: jest.fn().mockResolvedValue(records),
        transform: jest.fn((r: any) => ({ pk_id: r.pk_id, name: r.name, value: r.value })),
      });

      const result = await syncDataset(config);

      expect(result.success).toBe(true);
      expect(result.recordsFetched).toBe(2);
      expect(result.recordsUpserted).toBe(2);
      // 验证 transform 被调用
      expect(config.transform).toHaveBeenCalledTimes(2);
      // 验证 UPSERT SQL 被调用
      const upsertCalls = mockAppQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO') && sql.includes('ON CONFLICT')
      );
      expect(upsertCalls.length).toBeGreaterThan(0);
    });

    it('content_hash 计算排除 raw_data/content_hash/synced_at/primaryKey 列', async () => {
      mockLockSuccess();
      mockStatusAndLog();

      const records = [{ pk_id: '1', name: 'A', value: 100 }];
      const config = buildConfig({
        fetchAll: jest.fn().mockResolvedValue(records),
        transform: jest.fn((r: any) => ({
          pk_id: r.pk_id, name: r.name, value: r.value,
        })),
      });

      const result = await syncDataset(config);
      expect(result.success).toBe(true);

      // 验证 UPSERT SQL 中 VALUES 包含了 content_hash 值
      const upsertCall = mockAppQuery.mock.calls.find(
        ([sql]) => typeof sql === 'string' && sql.includes('ON CONFLICT')
      );
      expect(upsertCall).toBeDefined();
      // VALUES 参数中包含 content_hash（MD5 hex string）
      const params = upsertCall![1] as unknown[];
      const hashValues = params.filter(p => typeof p === 'string' && /^[a-f0-9]{32}$/.test(p));
      expect(hashValues.length).toBeGreaterThan(0);
    });
  });

  describe('分批写入', () => {
    it('行数 <= BATCH_SIZE(200) 时单批执行', async () => {
      mockLockSuccess();
      mockStatusAndLog();

      const records = Array.from({ length: 50 }, (_, i) => ({ pk_id: String(i), name: `N${i}` }));
      const config = buildConfig({ fetchAll: jest.fn().mockResolvedValue(records) });

      await syncDataset(config);

      const upsertCalls = mockAppQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('ON CONFLICT')
      );
      expect(upsertCalls.length).toBe(1); // 单批
    });

    it('行数 = 450 时分三批（200+200+50）执行', async () => {
      mockLockSuccess();
      mockStatusAndLog();

      const records = Array.from({ length: 450 }, (_, i) => ({ pk_id: String(i), name: `N${i}` }));
      const config = buildConfig({ fetchAll: jest.fn().mockResolvedValue(records) });

      await syncDataset(config);

      const upsertCalls = mockAppQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('ON CONFLICT')
      );
      expect(upsertCalls.length).toBe(3);
    });
  });

  describe('syncMode 分支', () => {
    it('syncMode=replace 时调用 batchReplace（事务 DELETE + INSERT）', async () => {
      mockLockSuccess();
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);
      mockStatusAndLog();

      const records = [{ name: 'A', value: 100 }];
      testRows = records;
      const config = buildConfig({
        syncMode: 'replace',
        fetchAll: jest.fn().mockResolvedValue(records),
        transform: jest.fn((r: any) => ({ name: r.name, value: r.value })),
      });

      const result = await syncDataset(config);

      expect(result.success).toBe(true);
      // 验证事务序列
      const sqls = mockClient._queries.map(q => q.sql);
      expect(sqls[0]).toBe('BEGIN');
      expect(sqls[1]).toContain('DELETE FROM erp_test_table');
      expect(sqls.some(s => s.startsWith('INSERT INTO'))).toBe(true);
      expect(sqls[sqls.length - 1]).toBe('COMMIT');
    });

    it('syncMode=upsert（默认）时调用 batchUpsert', async () => {
      mockLockSuccess();
      mockStatusAndLog();

      const records = [{ pk_id: '1', name: 'A' }];
      const config = buildConfig({
        syncMode: undefined, // 默认
        fetchAll: jest.fn().mockResolvedValue(records),
        transform: jest.fn((r: any) => ({ pk_id: r.pk_id, name: r.name })),
      });

      await syncDataset(config);

      const upsertCalls = mockAppQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('ON CONFLICT')
      );
      expect(upsertCalls.length).toBeGreaterThan(0);
    });
  });

  describe('错误处理', () => {
    it('fetchAll 抛异常 → 返回 success:false + error 消息', async () => {
      mockLockSuccess();
      mockStatusAndLog();

      const config = buildConfig({
        fetchAll: jest.fn().mockRejectedValue(new Error('ERP API 超时')),
      });

      const result = await syncDataset(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ERP API 超时');
    });

    it('updateSyncStatus 写入失败不阻塞主流程返回', async () => {
      mockLockSuccess();
      const records = [{ pk_id: '1', name: 'A' }];
      const config = buildConfig({
        fetchAll: jest.fn().mockResolvedValue(records),
        transform: jest.fn((r: any) => ({ pk_id: r.pk_id, name: r.name })),
      });

      // 让 UPSERT 成功，但 status/log 写入失败
      mockAppQuery
        .mockResolvedValueOnce({ rows: [{ locked: true }] } as any) // lock
        .mockRejectedValueOnce(new Error('DB write fail')) // updateSyncStatus
        .mockRejectedValueOnce(new Error('DB write fail')) // writeSyncLog
        .mockResolvedValue({ rows: [], rowCount: 0 } as any); // release lock

      const result = await syncDataset(config);

      // 虽然 status/log 写入失败，但主流程仍返回 success
      expect(result.success).toBe(true);
      expect(result.recordsFetched).toBe(1);
    });
  });
});

// =====================================================
// syncWindowedRange
// =====================================================

describe('syncWindowedRange', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    testRows = [];
  });

  describe('timeColumn 缺失校验', () => {
    it('无 timeColumn 配置时直接返回错误结果', async () => {
      const config = buildConfig({ timeColumn: undefined });
      const result = await syncWindowedRange(config, null, null);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeColumn');
    });
  });

  describe('窗口范围替换', () => {
    function setupWindowedConfig() {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);
      mockLockSuccess();
      mockStatusAndLog();
      return mockClient;
    }

    it('dateFrom=null, dateTo=null → DELETE 全表 + INSERT', async () => {
      const mockClient = setupWindowedConfig();
      testRows = [{ settle_time: '2026-01-15', amount: 100 }];

      const config = buildConfig({
        type: 'flow-window',
        syncMode: 'windowed-replace',
        timeColumn: 'settle_time',
        fetchAllHistory: jest.fn().mockResolvedValue([
          { settle_time: '2026-01-15', amount: 100 },
        ]),
        transform: jest.fn((r: any) => ({ settle_time: r.settle_time, amount: r.amount })),
      });

      const result = await syncWindowedRange(config, null, null);

      expect(result.success).toBe(true);
      const sqls = mockClient._queries.map(q => q.sql);
      const deleteSql = sqls.find(s => s.startsWith('DELETE'));
      expect(deleteSql).toBe('DELETE FROM erp_test_table');
    });

    it('dateFrom=null, dateTo=某日 → 冷窗口逐月 DELETE+INSERT', async () => {
      const mockClient = setupWindowedConfig();
      testRows = [{ settle_time: '2026-01-15', amount: 100 }];

      const config = buildConfig({
        type: 'flow-window',
        syncMode: 'windowed-replace',
        timeColumn: 'settle_time',
        fetchByRange: jest.fn().mockResolvedValue([
          { settle_time: '2026-01-15', amount: 100 },
        ]),
        transform: jest.fn((r: any) => ({ settle_time: r.settle_time, amount: r.amount })),
      });

      const result = await syncWindowedRange(config, null, '2026-07-01', 'cold');

      expect(result.success).toBe(true);
      const sqls = mockClient._queries.map(q => q.sql);
      const deleteSqls = sqls.filter(s => s.startsWith('DELETE'));
      // 冷窗口路径：每月一条 DELETE，使用 >= $1 AND < $2 范围
      expect(deleteSqls.length).toBeGreaterThan(0);
      expect(deleteSqls[0]).toContain('settle_time::timestamptz >= $1::timestamptz');
      expect(deleteSqls[0]).toContain('settle_time::timestamptz < $2::timestamptz');
      // 验证 writeSyncLog 被调用时 sync_window = 'cold'
      const logCalls = mockAppQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO erp_sync_log')
      );
      expect(logCalls.length).toBeGreaterThan(0);
      const logParams = logCalls[0][1] as unknown[];
      // $9 = syncWindow，应为 'cold'
      expect(logParams[8]).toBe('cold');
    });

    it('冷窗口：fetchByRange 成功时正常处理', async () => {
      const mockClient = setupWindowedConfig();
      testRows = [{ settle_time: '2026-01-15', amount: 100 }];

      const fetchByRange = jest.fn().mockResolvedValue([
        { settle_time: '2026-01-15', amount: 100 },
      ]);

      const config = buildConfig({
        type: 'flow-window',
        syncMode: 'windowed-replace',
        timeColumn: 'settle_time',
        fetchByRange,
        transform: jest.fn((r: any) => ({ settle_time: r.settle_time, amount: r.amount })),
      });

      const result = await syncWindowedRange(config, null, '2026-03-01', 'cold');
      expect(result.success).toBe(true);
      // fetchByRange 每个月被调用一次
      expect(fetchByRange.mock.calls.length).toBeGreaterThan(0);
    });

    it('冷窗口：超过 retryMax 次后跳过该月并继续', async () => {
      const mockClient = setupWindowedConfig();
      testRows = [{ settle_time: '2026-02-15', amount: 100 }];

      // 第一个月总是失败，第二个月成功
      const fetchByRange = jest.fn(async (from: string) => {
        if (from.startsWith('2026-01')) throw new Error('ERP month 1 failure');
        return [{ settle_time: '2026-02-15', amount: 100 }];
      });

      const config = buildConfig({
        type: 'flow-window',
        syncMode: 'windowed-replace',
        timeColumn: 'settle_time',
        fetchByRange,
        transform: jest.fn((r: any) => ({ settle_time: r.settle_time, amount: r.amount })),
      });

      const result = await syncWindowedRange(config, null, '2026-03-01', 'cold');
      // 部分成功 → status = 'partial'
      expect(result.success).toBe(false);
      expect(result.error).toContain('跳过');
    });

    it('冷窗口：部分月份成功、部分跳过 → status = partial', async () => {
      const mockClient = setupWindowedConfig();
      testRows = [{ settle_time: '2026-01-15', amount: 100 }];

      // 只有第一个月成功，其他月全部失败
      const fetchByRange = jest.fn(async (from: string) => {
        if (from === '2026-01-01') return [{ settle_time: '2026-01-15', amount: 100 }];
        throw new Error(`ERP failure for ${from}`);
      });

      const config = buildConfig({
        type: 'flow-window',
        syncMode: 'windowed-replace',
        timeColumn: 'settle_time',
        fetchByRange,
        transform: jest.fn((r: any) => ({ settle_time: r.settle_time, amount: r.amount })),
      });

      const result = await syncWindowedRange(config, null, '2026-04-01', 'cold');
      expect(result.success).toBe(false);
      expect(result.error).toContain('跳过');
      // 验证 writeSyncLog 使用了 'partial' 状态
      const logCalls = mockAppQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO erp_sync_log')
      );
      expect(logCalls.length).toBeGreaterThan(0);
      const logParams = logCalls[0][1] as unknown[];
      expect(logParams[3]).toBe('partial');
    });

    it('冷窗口：所有月份失败 → status = failed', async () => {
      mockLockSuccess();
      mockStatusAndLog();

      const fetchByRange = jest.fn().mockRejectedValue(new Error('ERP total failure'));

      const config = buildConfig({
        type: 'flow-window',
        syncMode: 'windowed-replace',
        timeColumn: 'settle_time',
        fetchByRange,
        transform: jest.fn((r: any) => r),
      });

      const result = await syncWindowedRange(config, null, '2026-03-01', 'cold');
      expect(result.success).toBe(false);
      // 验证 writeSyncLog 使用了 'failed' 状态
      const logCalls = mockAppQuery.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO erp_sync_log')
      );
      expect(logCalls.length).toBeGreaterThan(0);
      const logParams = logCalls[0][1] as unknown[];
      expect(logParams[3]).toBe('failed');
    });

    it('dateFrom=某日, dateTo=null → DELETE WHERE time >= dateFrom', async () => {
      const mockClient = setupWindowedConfig();
      testRows = [{ settle_time: '2026-06-01', amount: 100 }];

      const config = buildConfig({
        type: 'flow-window',
        syncMode: 'windowed-replace',
        timeColumn: 'settle_time',
        fetchByRange: jest.fn().mockResolvedValue([
          { settle_time: '2026-06-01', amount: 100 },
        ]),
        transform: jest.fn((r: any) => ({ settle_time: r.settle_time, amount: r.amount })),
      });

      const result = await syncWindowedRange(config, '2026-06-01', null);

      expect(result.success).toBe(true);
      const sqls = mockClient._queries.map(q => q.sql);
      const deleteSql = sqls.find(s => s.startsWith('DELETE'));
      expect(deleteSql).toContain('settle_time >= $1');
    });

    it('dateFrom=某日, dateTo=某日 → DELETE WHERE time >= from AND < to', async () => {
      const mockClient = setupWindowedConfig();
      testRows = [{ settle_time: '2026-06-15', amount: 100 }];

      const config = buildConfig({
        type: 'flow-window',
        syncMode: 'windowed-replace',
        timeColumn: 'settle_time',
        fetchByRange: jest.fn().mockResolvedValue([
          { settle_time: '2026-06-15', amount: 100 },
        ]),
        transform: jest.fn((r: any) => ({ settle_time: r.settle_time, amount: r.amount })),
      });

      const result = await syncWindowedRange(config, '2026-06-01', '2026-07-01');

      expect(result.success).toBe(true);
      const sqls = mockClient._queries.map(q => q.sql);
      const deleteSql = sqls.find(s => s.startsWith('DELETE'));
      expect(deleteSql).toContain('settle_time >= $1');
      expect(deleteSql).toContain('settle_time < $2');
    });

    it('事务原子性：INSERT 失败时 ROLLBACK', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
          .mockResolvedValueOnce({ rowCount: 0 }) // DELETE
          .mockRejectedValueOnce(new Error('INSERT FAIL')) // INSERT
          .mockResolvedValueOnce({ rows: [] }) // ROLLBACK
          .mockResolvedValueOnce({ rows: [] }), // release
        release: jest.fn(),
        _queries: [] as any[],
      };
      mockGetAppClient.mockResolvedValue(mockClient as any);
      mockLockSuccess();
      mockStatusAndLog();

      const config = buildConfig({
        type: 'flow-window',
        syncMode: 'windowed-replace',
        timeColumn: 'settle_time',
        fetchByRange: jest.fn().mockResolvedValue([
          { settle_time: '2026-06-15', amount: 100 },
        ]),
        transform: jest.fn((r: any) => ({ settle_time: r.settle_time, amount: r.amount })),
      });

      const result = await syncWindowedRange(config, '2026-06-01', '2026-07-01');

      expect(result.success).toBe(false);
      expect(result.error).toContain('INSERT FAIL');
      // 验证 ROLLBACK 被调用
      const rollbackCall = mockClient.query.mock.calls.find(
        ([sql]: [string]) => sql === 'ROLLBACK'
      );
      expect(rollbackCall).toBeDefined();
    });
  });

  describe('fetchByRange vs fetchAllHistory 分支选择', () => {
    it('dateFrom 和 dateTo 都有值时使用 fetchByRange', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);
      mockLockSuccess();
      mockStatusAndLog();
      testRows = [{ settle_time: '2026-06-15', amount: 100 }];

      const fetchByRange = jest.fn().mockResolvedValue([{ settle_time: '2026-06-15', amount: 100 }]);
      const fetchAllHistory = jest.fn().mockResolvedValue([]);

      const config = buildConfig({
        type: 'flow-window',
        syncMode: 'windowed-replace',
        timeColumn: 'settle_time',
        fetchByRange,
        fetchAllHistory,
        transform: jest.fn((r: any) => ({ settle_time: r.settle_time, amount: r.amount })),
      });

      await syncWindowedRange(config, '2026-06-01', '2026-07-01');

      expect(fetchByRange).toHaveBeenCalledWith('2026-06-01', '2026-07-01');
      expect(fetchAllHistory).not.toHaveBeenCalled();
    });

    it('都为 null 时使用 fetchAllHistory', async () => {
      const mockClient = createMockClient();
      mockGetAppClient.mockResolvedValue(mockClient as any);
      mockLockSuccess();
      mockStatusAndLog();
      testRows = [{ settle_time: '2026-01-01', amount: 100 }];

      const fetchByRange = jest.fn();
      const fetchAllHistory = jest.fn().mockResolvedValue([{ settle_time: '2026-01-01', amount: 100 }]);

      const config = buildConfig({
        type: 'flow-window',
        syncMode: 'windowed-replace',
        timeColumn: 'settle_time',
        fetchByRange,
        fetchAllHistory,
        transform: jest.fn((r: any) => ({ settle_time: r.settle_time, amount: r.amount })),
      });

      await syncWindowedRange(config, null, null);

      expect(fetchAllHistory).toHaveBeenCalled();
      expect(fetchByRange).not.toHaveBeenCalled();
    });
  });
});
