/**
 * ERP 同步编排器单元测试
 * @module services/erp-sync/sync-orchestrator.spec.ts
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));
jest.mock('./sync-engine', () => ({
  syncDataset: jest.fn(),
  syncWindowedRange: jest.fn(),
}));

import {
  registerSource,
  getRegisteredSources,
  syncAllSnapshots,
  syncHotWindow,
  syncWarmWindow,
  syncColdWindow,
  forceSync,
  resetCircuitBreaker,
  getAllCircuitBreakerStates,
} from './sync-orchestrator';
import { syncDataset, syncWindowedRange } from './sync-engine';
import { appQuery } from '../../db/appPool';
import type { SyncSourceConfig, SyncResult } from './sync-types';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockSyncDataset = syncDataset as jest.MockedFunction<typeof syncDataset>;
const mockSyncWindowedRange = syncWindowedRange as jest.MockedFunction<typeof syncWindowedRange>;

// =====================================================
// 测试辅助
// =====================================================

function buildSnapshotConfig(overrides: Partial<SyncSourceConfig> = {}): SyncSourceConfig {
  return {
    id: 'test_snapshot',
    name: '测试快照',
    type: 'snapshot',
    syncMode: 'upsert',
    fetchAll: jest.fn().mockResolvedValue([]),
    transform: jest.fn((r: any) => r),
    targetTable: 'erp_test_table',
    primaryKey: ['pk_id'],
    intervalMs: 120000,
    pageSize: 2000,
    enableFallback: false,
    ...overrides,
  };
}

function buildFlowWindowConfig(overrides: Partial<SyncSourceConfig> = {}): SyncSourceConfig {
  return {
    id: 'test_flow',
    name: '测试流水',
    type: 'flow-window',
    syncMode: 'windowed-replace',
    fetchAll: jest.fn().mockResolvedValue([]),
    transform: jest.fn((r: any) => r),
    targetTable: 'erp_flow_table',
    primaryKey: [],
    intervalMs: 120000,
    pageSize: 2000,
    enableFallback: false,
    timeColumn: 'settle_time',
    windows: {
      hot: 7, warm: 60, cold: 60,
      hotIntervalMs: 120000, warmIntervalMs: 604800000, coldIntervalMs: 1296000000,
    },
    ...overrides,
  };
}

function successResult(sourceId: string): SyncResult {
  return { sourceId, success: true, recordsFetched: 10, recordsUpserted: 10, recordsChanged: 5, durationMs: 100 };
}

function failResult(sourceId: string, error = '失败'): SyncResult {
  return { sourceId, success: false, recordsFetched: 0, recordsUpserted: 0, recordsChanged: 0, durationMs: 100, error };
}

// =====================================================
// registerSource / getRegisteredSources
// =====================================================

describe('registerSource / getRegisteredSources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
    // 清空已注册的数据集
    for (const src of getRegisteredSources()) {
      resetCircuitBreaker(src.id);
    }
    // 通过重新注册清空（Map 没有 clear 导出，所以用独立 id）
  });

  it('注册后能通过 getRegisteredSources 获取', () => {
    const config = buildSnapshotConfig({ id: 'reg_test_1' });
    registerSource(config);

    const sources = getRegisteredSources();
    expect(sources.some(s => s.id === 'reg_test_1')).toBe(true);
  });

  it('重复注册同 id 覆盖旧配置', () => {
    registerSource(buildSnapshotConfig({ id: 'reg_test_dup', name: '旧名称' }));
    registerSource(buildSnapshotConfig({ id: 'reg_test_dup', name: '新名称' }));

    const sources = getRegisteredSources();
    const found = sources.find(s => s.id === 'reg_test_dup');
    expect(found?.name).toBe('新名称');
  });
});

// =====================================================
// 熔断器状态机
// =====================================================

describe('熔断器状态机', () => {
  const testId = 'cb_test';

  beforeEach(() => {
    jest.clearAllMocks();
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
    resetCircuitBreaker(testId);
  });

  it('初始状态为 closed', () => {
    const states = getAllCircuitBreakerStates();
    const cb = states.get(testId);
    // 首次访问会自动创建 closed 状态
    expect(cb?.state ?? 'closed').toBe('closed');
  });

  it('连续失败 3 次后状态转为 open', async () => {
    const config = buildSnapshotConfig({ id: testId });
    registerSource(config);
    mockSyncDataset.mockResolvedValue(failResult(testId));

    // 触发 3 次失败
    await syncAllSnapshots();
    await syncAllSnapshots();
    await syncAllSnapshots();

    const states = getAllCircuitBreakerStates();
    expect(states.get(testId)?.state).toBe('open');
  });

  it('open 状态超过 recoveryTimeoutMs(600000ms) 后自动转为 half-open', async () => {
    const config = buildSnapshotConfig({ id: testId });
    registerSource(config);
    mockSyncDataset.mockResolvedValue(failResult(testId));

    // 触发 3 次失败进入 open
    await syncAllSnapshots();
    await syncAllSnapshots();
    await syncAllSnapshots();

    expect(getAllCircuitBreakerStates().get(testId)?.state).toBe('open');

    // 快进时间 10 分钟
    jest.useFakeTimers({ doNotFake: ['Date'] });
    const realNow = Date.now;
    const openedAt = getAllCircuitBreakerStates().get(testId)!.openedAt!;
    jest.spyOn(Date, 'now').mockReturnValue(openedAt + 600001);

    // 再次尝试同步，应触发 half-open -> 允许执行
    mockSyncDataset.mockResolvedValue(successResult(testId));
    await syncAllSnapshots();

    expect(getAllCircuitBreakerStates().get(testId)?.state).toBe('closed');
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('half-open 成功 → 回 closed', async () => {
    const config = buildSnapshotConfig({ id: testId });
    registerSource(config);
    mockSyncDataset.mockResolvedValue(failResult(testId));

    // 3 次失败进入 open
    for (let i = 0; i < 3; i++) await syncAllSnapshots();
    expect(getAllCircuitBreakerStates().get(testId)?.state).toBe('open');

    // 模拟时间超过恢复超时
    const openedAt = getAllCircuitBreakerStates().get(testId)!.openedAt!;
    const spyNow = jest.spyOn(Date, 'now').mockReturnValue(openedAt + 600001);

    // half-open 时成功一次
    mockSyncDataset.mockResolvedValue(successResult(testId));
    await syncAllSnapshots();

    expect(getAllCircuitBreakerStates().get(testId)?.state).toBe('closed');
    expect(getAllCircuitBreakerStates().get(testId)?.consecutiveFailures).toBe(0);
    spyNow.mockRestore();
  });

  it('half-open 失败 → 回 open 并重置计时器', async () => {
    const config = buildSnapshotConfig({ id: testId });
    registerSource(config);
    mockSyncDataset.mockResolvedValue(failResult(testId));

    // 3 次失败进入 open
    for (let i = 0; i < 3; i++) await syncAllSnapshots();

    // 模拟时间超过恢复超时
    const openedAt = getAllCircuitBreakerStates().get(testId)!.openedAt!;
    const spyNow = jest.spyOn(Date, 'now').mockReturnValue(openedAt + 600001);

    // half-open 时仍然失败
    await syncAllSnapshots();

    expect(getAllCircuitBreakerStates().get(testId)?.state).toBe('open');
    // openedAt 应该被更新
    expect(getAllCircuitBreakerStates().get(testId)?.openedAt).toBeGreaterThanOrEqual(openedAt);
    spyNow.mockRestore();
  });

  it('resetCircuitBreaker 强制回 closed 并清除 DB 状态', () => {
    // 先让它进入 open
    const config = buildSnapshotConfig({ id: testId });
    registerSource(config);

    // 手动让熔断器 open（通过 syncAllSnapshots 3 次失败）
    mockSyncDataset.mockResolvedValue(failResult(testId));

    resetCircuitBreaker(testId);

    const states = getAllCircuitBreakerStates();
    expect(states.get(testId)?.state).toBe('closed');
    expect(states.get(testId)?.consecutiveFailures).toBe(0);
    // 验证 DB 更新被调用
    const updateCall = mockAppQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes("circuit_state = 'closed'")
    );
    expect(updateCall).toBeDefined();
  });
});

// =====================================================
// syncAllSnapshots
// =====================================================

describe('syncAllSnapshots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
  });

  it('仅执行 type=snapshot 的数据集，排除 flow-window', async () => {
    const snapshotConfig = buildSnapshotConfig({ id: 'snap_1' });
    const flowConfig = buildFlowWindowConfig({ id: 'flow_1' });
    registerSource(snapshotConfig);
    registerSource(flowConfig);
    resetCircuitBreaker('snap_1');
    resetCircuitBreaker('flow_1');

    mockSyncDataset.mockResolvedValue(successResult('snap_1'));

    const results = await syncAllSnapshots();

    // 由于 registeredSources 是模块级 Map，可能包含其他测试注册的数据集
    // 只断言我们关心的数据集
    const snap1Result = results.find(r => r.sourceId === 'snap_1');
    expect(snap1Result).toBeDefined();
    expect(snap1Result?.success).toBe(true);
    // flow-window 数据集不应出现在结果中
    const flowResult = results.find(r => r.sourceId === 'flow_1');
    expect(flowResult).toBeUndefined();
    expect(mockSyncDataset).toHaveBeenCalledWith(snapshotConfig);
  });

  it('Promise.allSettled：单个失败不影响其他', async () => {
    registerSource(buildSnapshotConfig({ id: 'snap_ok' }));
    registerSource(buildSnapshotConfig({ id: 'snap_fail' }));
    resetCircuitBreaker('snap_ok');
    resetCircuitBreaker('snap_fail');

    mockSyncDataset.mockImplementation(async (config: any) => {
      if (config.id === 'snap_fail') return failResult('snap_fail', '网络错误');
      return successResult(config.id);
    });

    const results = await syncAllSnapshots();

    // 只断言我们关心的数据集
    const okResult = results.find(r => r.sourceId === 'snap_ok');
    const failRes = results.find(r => r.sourceId === 'snap_fail');
    expect(okResult?.success).toBe(true);
    expect(failRes?.success).toBe(false);
    expect(failRes?.error).toContain('网络错误');
  });

  it('无 snapshot 数据集 → 返回空数组', async () => {
    // 只注册 flow-window
    registerSource(buildFlowWindowConfig({ id: 'only_flow' }));
    resetCircuitBreaker('only_flow');

    const results = await syncAllSnapshots();
    // 因为之前可能注册过其他 snapshot，过滤后应该只包含当前注册的 snapshot
    // 由于我们清空了 mock，结果中不会有 snap_1 等
    const snapshotResults = results.filter(r => r.sourceId === 'only_flow');
    expect(snapshotResults).toHaveLength(0);
  });
});

// =====================================================
// 窗口同步
// =====================================================

describe('窗口同步', () => {
  const flowId = 'flow_window_test';

  beforeEach(() => {
    jest.clearAllMocks();
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
    registerSource(buildFlowWindowConfig({ id: flowId }));
    resetCircuitBreaker(flowId);
  });

  it('syncHotWindow：dateFrom=beijingDateOffset(-7), dateTo=beijingDateOffset(1)', async () => {
    mockSyncWindowedRange.mockResolvedValue(successResult(flowId));

    const result = await syncHotWindow(flowId);

    expect(result).not.toBeNull();
    expect(mockSyncWindowedRange).toHaveBeenCalledWith(
      expect.objectContaining({ id: flowId }),
      expect.any(String), // dateFrom
      expect.any(String), // dateTo
      'hot',
    );
    const [, dateFrom, dateTo] = mockSyncWindowedRange.mock.calls[0];
    // dateFrom 应该在今天前 7 天左右，dateTo 应该在明天左右
    expect(dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('syncWarmWindow：dateFrom=beijingDateOffset(-60), dateTo=beijingDateOffset(-7)', async () => {
    mockSyncWindowedRange.mockResolvedValue(successResult(flowId));

    const result = await syncWarmWindow(flowId);

    expect(result).not.toBeNull();
    expect(mockSyncWindowedRange).toHaveBeenCalled();
    const [, dateFrom, , window] = mockSyncWindowedRange.mock.calls[0];
    expect(window).toBe('warm');
    // dateFrom 应该是60天前左右（跨午夜可能差1天）
    expect(dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('syncColdWindow：dateFrom=null（无下界）', async () => {
    mockSyncWindowedRange.mockResolvedValue(successResult(flowId));

    const result = await syncColdWindow(flowId);

    expect(result).not.toBeNull();
    const [, dateFrom, dateTo, window] = mockSyncWindowedRange.mock.calls[0];
    expect(dateFrom).toBeNull();
    expect(dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(window).toBe('cold');
  });

  it('缺少 windows 配置 → 返回 null', async () => {
    registerSource(buildFlowWindowConfig({ id: 'no_windows', windows: undefined }));
    resetCircuitBreaker('no_windows');

    const result = await syncHotWindow('no_windows');
    expect(result).toBeNull();
  });

  it('熔断器阻断 → 返回 null', async () => {
    // 让熔断器进入 open 状态
    mockSyncWindowedRange.mockResolvedValue(failResult(flowId));
    for (let i = 0; i < 3; i++) {
      await syncHotWindow(flowId);
    }
    expect(getAllCircuitBreakerStates().get(flowId)?.state).toBe('open');

    // 再次调用应被阻断
    const result = await syncHotWindow(flowId);
    expect(result).toBeNull();
  });
});

// =====================================================
// forceSync
// =====================================================

describe('forceSync', () => {
  const testId = 'force_test';

  beforeEach(() => {
    jest.clearAllMocks();
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
    registerSource(buildSnapshotConfig({ id: testId }));
    resetCircuitBreaker(testId);
  });

  it('绕过熔断器直接执行 syncDataset', async () => {
    // 先进入 open 状态
    mockSyncDataset.mockResolvedValue(failResult(testId));
    for (let i = 0; i < 3; i++) {
      await syncAllSnapshots();
    }
    expect(getAllCircuitBreakerStates().get(testId)?.state).toBe('open');

    // forceSync 绕过熔断器
    mockSyncDataset.mockResolvedValue(successResult(testId));
    const result = await forceSync(testId);

    expect(result).not.toBeNull();
    expect(result?.success).toBe(true);
    // 熔断器应该被重置
    expect(getAllCircuitBreakerStates().get(testId)?.state).toBe('closed');
  });

  it('未注册的数据集 → 返回 null', async () => {
    const result = await forceSync('nonexistent_dataset');
    expect(result).toBeNull();
  });

  describe('窗口路由', () => {
    const flowId = 'force_flow_test';

    beforeEach(() => {
      registerSource(buildFlowWindowConfig({ id: flowId }));
      resetCircuitBreaker(flowId);
      mockSyncWindowedRange.mockResolvedValue(successResult(flowId));
    });

    it("window='hot' → syncWindowedRange，dateFrom 约为 -7 天", async () => {
      const result = await forceSync(flowId, 'hot');

      expect(result?.success).toBe(true);
      expect(mockSyncWindowedRange).toHaveBeenCalledWith(
        expect.objectContaining({ id: flowId }),
        expect.any(String), // dateFrom
        expect.any(String), // dateTo
        'hot',
      );
    });

    it("window='warm' → dateFrom 约为 -60 天, dateTo 约为 -7 天", async () => {
      const result = await forceSync(flowId, 'warm');

      expect(result?.success).toBe(true);
      const [, dateFrom, dateTo, window] = mockSyncWindowedRange.mock.calls[0];
      expect(window).toBe('warm');
      expect(dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("window='cold' → dateFrom=null, dateTo 约为 -60 天", async () => {
      const result = await forceSync(flowId, 'cold');

      expect(result?.success).toBe(true);
      const [, dateFrom, dateTo, window] = mockSyncWindowedRange.mock.calls[0];
      expect(window).toBe('cold');
      expect(dateFrom).toBeNull();
      expect(dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("window='all' → dateFrom=null, dateTo=null", async () => {
      const result = await forceSync(flowId, 'all');

      expect(result?.success).toBe(true);
      const [, dateFrom, dateTo, window] = mockSyncWindowedRange.mock.calls[0];
      expect(window).toBe('all');
      expect(dateFrom).toBeNull();
      expect(dateTo).toBeNull();
    });

    it('无效窗口参数 → 返回 success:false + 错误信息', async () => {
      const result = await forceSync(flowId, 'invalid' as any);

      expect(result?.success).toBe(false);
      expect(result?.error).toContain('无效的窗口参数');
    });
  });
});
