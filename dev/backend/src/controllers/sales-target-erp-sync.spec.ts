/**
 * Controller 层集成测试 — 目标管理 + ERP 同步状态
 * @module controllers/sales-target-erp-sync.spec.ts
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../db/appPool', () => ({ appQuery: jest.fn() }));
jest.mock('../services/sales-target', () => ({
  queryTargetList: jest.fn(),
  queryTargetDetail: jest.fn(),
  saveTarget: jest.fn(),
  updateTarget: jest.fn(),
  removeTarget: jest.fn(),
  getMarketerErpStaffIds: jest.fn(),
  getMarketerStaffId: jest.fn(),
  getCustomerList: jest.fn(),
  getProductCatalog: jest.fn(),
  getHistoricalSales: jest.fn(),
  buildInitialTargetData: jest.fn(),
  getOverviewData: jest.fn(),
}));
jest.mock('../services/erp-sync/sync-orchestrator', () => ({
  forceSync: jest.fn(),
  resetCircuitBreaker: jest.fn(),
  getAllCircuitBreakerStates: jest.fn(),
  getRegisteredSources: jest.fn(),
}));

import {
  listHandler, detailHandler, createHandler, updateHandler,
  deleteHandler, initDataHandler, overviewHandler,
} from './sales-target.controller';
import {
  getSyncStatus, getSyncLog, handleForceSync,
  handleResetCircuit,
} from './erp-sync-status.controller';
import { appQuery } from '../db/appPool';
import {
  queryTargetList, queryTargetDetail, saveTarget,
  updateTarget, removeTarget, buildInitialTargetData,
  getOverviewData, getMarketerErpStaffIds, getCustomerList,
  getProductCatalog, getHistoricalSales,
} from '../services/sales-target';
import {
  forceSync, resetCircuitBreaker, getRegisteredSources,
} from '../services/erp-sync/sync-orchestrator';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

function mockReq(overrides: any = {}): any {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

function mockRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

// =====================================================
// sales-target.controller
// =====================================================

describe('detailHandler', () => {
  it('id=NaN → 400', async () => {
    const res = mockRes();
    await detailHandler(mockReq({ params: { id: 'abc' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('无效') }));
  });

  it('目标不存在 → 404', async () => {
    (queryTargetDetail as jest.Mock).mockResolvedValue(null);
    const res = mockRes();
    await detailHandler(mockReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('成功 → 返回 toCamelKeys(detail)', async () => {
    (queryTargetDetail as jest.Mock).mockResolvedValue({
      id: 1, marketer_id: 100, marketer_name: '张三',
    });
    const res = mockRes();
    await detailHandler(mockReq({ params: { id: '1' } }), res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, marketerId: 100, marketerName: '张三' })
    );
  });
});

describe('createHandler', () => {
  it('缺少 marketer_id → 400', async () => {
    const res = mockRes();
    await createHandler(mockReq({ body: { year: 2026, month: 7, items: [] } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('marketer_id') }));
  });

  it('snake_case 和 camelCase 参数双兼容', async () => {
    (saveTarget as jest.Mock).mockResolvedValue({ id: 1, marketer_id: 100 });
    const res = mockRes();
    await createHandler(mockReq({
      body: {
        marketerId: 100, // camelCase
        year: 2026, month: 7,
        items: [{ erpConsumerId: 1001, consumerName: '客户A' }],
      },
    }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(saveTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        marketer_id: 100,
        items: expect.arrayContaining([
          expect.objectContaining({ erp_consumer_id: 1001, consumer_name: '客户A' }),
        ]),
      })
    );
  });
});

describe('initDataHandler', () => {
  it('缺少 marketer_id → 400', async () => {
    const res = mockRes();
    await initDataHandler(mockReq({ query: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('已有保存目标 → 返回 is_saved=true + 详情', async () => {
    (queryTargetList as jest.Mock).mockResolvedValue([{ id: 1 }]);
    (queryTargetDetail as jest.Mock).mockResolvedValue({
      id: 1, marketer_id: 100, marketer_name: '张三', year: 2026, month: 7, customers: [],
    });
    const res = mockRes();
    await initDataHandler(mockReq({ query: { marketer_id: '100', year: '2026', month: '7' } }), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ isSaved: true, targetId: 1 })
    );
  });

  it('无保存目标 → 调用 buildInitialTargetData', async () => {
    (queryTargetList as jest.Mock).mockResolvedValue([]);
    (buildInitialTargetData as jest.Mock).mockResolvedValue({
      is_saved: false, marketer_id: 100, customers: [],
    });
    const res = mockRes();
    await initDataHandler(mockReq({ query: { marketer_id: '100', year: '2026', month: '7' } }), res);

    expect(buildInitialTargetData).toHaveBeenCalledWith(100, 2026, 7);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ isSaved: false })
    );
  });
});

describe('overviewHandler', () => {
  it('默认 year=当前年, month=当前月', async () => {
    (getOverviewData as jest.Mock).mockResolvedValue({ summary: {}, marketers: [] });
    const res = mockRes();
    await overviewHandler(mockReq({ query: {} }), res);

    const now = new Date();
    expect(getOverviewData).toHaveBeenCalledWith(now.getFullYear(), now.getMonth() + 1);
  });
});

// =====================================================
// erp-sync-status.controller
// =====================================================

describe('getSyncLog', () => {
  it('limit 上限 200', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
    const res = mockRes();
    await getSyncLog(mockReq({ query: { limit: '500' } }), res, jest.fn());

    const [, params] = mockAppQuery.mock.calls[0];
    expect(params).toContain(200); // Math.min(500, 200)
  });

  it('source_id 过滤', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
    const res = mockRes();
    await getSyncLog(mockReq({ query: { source_id: 'debts' } }), res, jest.fn());

    const [sql] = mockAppQuery.mock.calls[0];
    expect(sql).toContain('WHERE source_id = $1');
  });

  it('默认 limit=50', async () => {
    mockAppQuery.mockResolvedValue({ rows: [] } as any);
    const res = mockRes();
    await getSyncLog(mockReq({ query: {} }), res, jest.fn());

    const [, params] = mockAppQuery.mock.calls[0];
    expect(params).toContain(50);
  });
});

describe('handleForceSync', () => {
  it('未注册数据集 → 404', async () => {
    (forceSync as jest.Mock).mockResolvedValue(null);
    const res = mockRes();
    await handleForceSync(mockReq({ params: { id: 'unknown' } }), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('成功 → 返回同步结果', async () => {
    (forceSync as jest.Mock).mockResolvedValue({
      sourceId: 'debts', success: true, recordsFetched: 10,
      recordsUpserted: 10, recordsChanged: 5, durationMs: 100,
    });
    const res = mockRes();
    await handleForceSync(mockReq({ params: { id: 'debts' } }), res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ success: true, recordsFetched: 10 }),
    }));
  });
});

describe('getSyncStatus', () => {
  it('补充数据集名称', async () => {
    mockAppQuery.mockResolvedValue({
      rows: [{ source_id: 'debts', total_records: 100 }],
    } as any);
    (getRegisteredSources as jest.Mock).mockReturnValue([
      { id: 'debts', name: '客户欠款' },
    ]);
    const res = mockRes();
    await getSyncStatus(mockReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ source_id: 'debts', name: '客户欠款' }),
      ]),
    }));
  });

  it('flow-window 数据源 → 返回 windows_status 和 window_counts 填充的 total_records', async () => {
    // 第一次查询: erp_sync_status
    mockAppQuery
      .mockResolvedValueOnce({
        rows: [{
          source_id: 'sales',
          total_records: 100000,
          window_counts: { hot: 5000, warm: 12000, cold: 80000 },
        }],
      } as any)
      // 第二次查询: DISTINCT ON (各窗口最近同步日志)
      .mockResolvedValueOnce({
        rows: [
          { source_id: 'sales', sync_window: 'hot', last_success_at: '2026-07-03T10:00:00Z', last_duration_ms: 2000, last_status: 'success' },
          { source_id: 'sales', sync_window: 'warm', last_success_at: '2026-06-30T03:00:00Z', last_duration_ms: 5000, last_status: 'success' },
          { source_id: 'sales', sync_window: 'cold', last_success_at: '2026-07-01T04:00:00Z', last_duration_ms: 60000, last_status: 'success' },
        ],
      } as any);

    (getRegisteredSources as jest.Mock).mockReturnValue([
      { id: 'sales', name: '销售明细', type: 'flow-window' },
    ]);

    const res = mockRes();
    await getSyncStatus(mockReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({
          source_id: 'sales',
          name: '销售明细',
          windows_status: expect.arrayContaining([
            expect.objectContaining({ window: 'hot', total_records: 5000 }),
            expect.objectContaining({ window: 'warm', total_records: 12000 }),
            expect.objectContaining({ window: 'cold', total_records: 80000 }),
          ]),
        }),
      ]),
    }));
  });

  it('flow-window 数据源 + window_counts 为 null → total_records 兜底为 0', async () => {
    mockAppQuery
      .mockResolvedValueOnce({
        rows: [{ source_id: 'sales', total_records: 0, window_counts: null }],
      } as any)
      .mockResolvedValueOnce({
        rows: [
          { source_id: 'sales', sync_window: 'hot', last_success_at: null, last_duration_ms: null, last_status: 'failed' },
        ],
      } as any);

    (getRegisteredSources as jest.Mock).mockReturnValue([
      { id: 'sales', name: '销售明细', type: 'flow-window' },
    ]);

    const res = mockRes();
    await getSyncStatus(mockReq(), res, jest.fn());

    const callData = res.json.mock.calls[0][0];
    const salesItem = callData.data.find((d: any) => d.source_id === 'sales');
    expect(salesItem).toBeDefined();
    expect(salesItem.windows_status).toBeDefined();
    // window_counts 为 null 时，total_records 应该为 0
    for (const w of salesItem.windows_status) {
      expect(w.total_records).toBe(0);
    }
  });
});

describe('handleResetCircuit', () => {
  it('重置熔断器 → 200', async () => {
    const res = mockRes();
    await handleResetCircuit(mockReq({ params: { id: 'debts' } }), res, jest.fn());
    expect(resetCircuitBreaker).toHaveBeenCalledWith('debts');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });
});
