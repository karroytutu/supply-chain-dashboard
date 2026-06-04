/**
 * 催收数据同步定时任务单元测试
 * 测试: syncERPDebts, checkExtensionExpiry, checkHoldExpiry
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));
jest.mock('../erp-client/erp-debt.service', () => ({
  fetchAllErpDebts: jest.fn(),
}));
jest.mock('./ar-hoard-detect', () => ({
  detectAllHoardChanges: jest.fn(),
}));
jest.mock('./ar-collection.repository', () => ({
  invalidateTaskCache: jest.fn(),
  invalidateStatsCache: jest.fn(),
}));

import { syncERPDebts, checkExtensionExpiry, checkHoldExpiry } from './ar-collection-sync.task';
import { fetchAllErpDebts } from '../erp-client/erp-debt.service';
import { appQuery, getAppClient } from '../../db/appPool';
import { detectAllHoardChanges } from './ar-hoard-detect';
import { invalidateTaskCache, invalidateStatsCache } from './ar-collection.repository';
import {
  AR_HOLD_TYPE_TIME_LIMITED,
  AR_HOARD_TAG_HOARD,
  AR_DETAIL_STATUS_HOARD_EXCLUDED,
} from '../../utils/constants';

const mockAppQuery = appQuery as jest.Mock;
const mockGetAppClient = getAppClient as jest.Mock;
const mockFetchAllErpDebts = fetchAllErpDebts as jest.Mock;
const mockDetectAllHoardChanges = detectAllHoardChanges as jest.Mock;
const mockInvalidateTaskCache = invalidateTaskCache as jest.Mock;
const mockInvalidateStatsCache = invalidateStatsCache as jest.Mock;

function createMockClient() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================
// syncERPDebts
// ============================================

describe('syncERPDebts', () => {
  it('成功同步: 新增 + 更新 + 消失', async () => {
    const erpDebts = [
      { billId: 'B1', leftAmount: 100 },
      { billId: 'B2', leftAmount: 200 },
    ];
    mockFetchAllErpDebts.mockResolvedValue(erpDebts);

    // 本地明细: B2(金额变化) + B3(将消失)
    mockAppQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 10, task_id: 1, erp_bill_id: 'B2', left_amount: 150, status: 'pending' },
          { id: 11, task_id: 2, erp_bill_id: 'B3', left_amount: 300, status: 'pending' },
        ],
      })
      // handleRemovedDebt: 查询任务
      .mockResolvedValueOnce({
        rows: [{ id: 2, status: 'collecting', consumer_name: '客户A', total_amount: 300, manager_user_id: null }],
      });

    await syncERPDebts();

    // fetchAllErpDebts 被调用 (skipCache=true)
    expect(mockFetchAllErpDebts).toHaveBeenCalledWith(true);

    // B2 金额变化触发 UPDATE
    expect(mockAppQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE ar_collection_details SET left_amount'),
      [200, 10]
    );

    // B3 消失触发 handleRemovedDebt
    expect(mockAppQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE ar_collection_tasks SET status = 'closed'"),
      [2]
    );

    // 压单检测被调用
    expect(mockDetectAllHoardChanges).toHaveBeenCalled();
  });

  it('ERP返回空列表时处理正常', async () => {
    mockFetchAllErpDebts.mockResolvedValue([]);
    mockAppQuery.mockResolvedValueOnce({ rows: [] });

    await syncERPDebts();

    expect(mockDetectAllHoardChanges).toHaveBeenCalled();
  });

  it('fetch失败时抛出错误', async () => {
    mockFetchAllErpDebts.mockRejectedValue(new Error('ERP连接失败'));

    await expect(syncERPDebts()).rejects.toThrow('ERP连接失败');
  });

  it('handleRemovedDebt: 已关闭任务跳过处理', async () => {
    mockFetchAllErpDebts.mockResolvedValue([]);
    mockAppQuery
      .mockResolvedValueOnce({
        rows: [{ id: 10, task_id: 1, erp_bill_id: 'B1', left_amount: 100, status: 'pending' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 1, status: 'closed', consumer_name: '客户B', total_amount: 0, manager_user_id: null }],
      });

    await syncERPDebts();

    // 不应该执行关闭操作
    const updateCalls = mockAppQuery.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes("SET status = 'closed'")
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('新增ERP记录时不插入明细', async () => {
    mockFetchAllErpDebts.mockResolvedValue([{ billId: 'NEW1', leftAmount: 500 }]);
    mockAppQuery.mockResolvedValueOnce({ rows: [] });

    await syncERPDebts();

    // 不应有 INSERT 或 UPDATE 明细的调用
    const insertDetailCalls = mockAppQuery.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('ar_collection_details') && c[0].includes('INSERT')
    );
    expect(insertDetailCalls).toHaveLength(0);
  });
});

// ============================================
// checkExtensionExpiry
// ============================================

describe('checkExtensionExpiry', () => {
  it('无到期延期任务时直接返回', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [] });

    await checkExtensionExpiry();

    expect(mockGetAppClient).not.toHaveBeenCalled();
  });

  it('处理到期延期任务: 恢复催收状态 + 失效缓存', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, current_extension_id: 100 },
        { id: 2, current_extension_id: null },
      ],
    });

    const client = createMockClient();
    mockGetAppClient.mockResolvedValue(client);

    await checkExtensionExpiry();

    // BEGIN
    expect(client.query).toHaveBeenCalledWith('BEGIN');

    // 恢复催收状态
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'collecting'"),
      [1]
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'collecting'"),
      [2]
    );

    // 更新延期记录状态 (仅任务1有extension_id)
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'expired'"),
      [100]
    );

    // 记录操作日志
    const actionCalls = client.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('ar_collection_actions')
    );
    expect(actionCalls).toHaveLength(2);

    // COMMIT
    expect(client.query).toHaveBeenCalledWith('COMMIT');

    // 缓存失效
    expect(mockInvalidateTaskCache).toHaveBeenCalledWith(1);
    expect(mockInvalidateTaskCache).toHaveBeenCalledWith(2);
    expect(mockInvalidateStatsCache).toHaveBeenCalled();

    // 释放连接
    expect(client.release).toHaveBeenCalled();
  });

  it('事务内失败时ROLLBACK', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ id: 1, current_extension_id: 100 }],
    });

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql.includes('UPDATE ar_collection_tasks')) return Promise.reject(new Error('DB error'));
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await expect(checkExtensionExpiry()).rejects.toThrow('DB error');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('查询失败时抛出错误', async () => {
    mockAppQuery.mockRejectedValue(new Error('Query failed'));
    await expect(checkExtensionExpiry()).rejects.toThrow('Query failed');
  });
});

// ============================================
// checkHoldExpiry
// ============================================

describe('checkHoldExpiry', () => {
  it('无到期期限压单时直接返回', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [] });

    await checkHoldExpiry();

    expect(mockGetAppClient).not.toHaveBeenCalled();
  });

  it('处理到期期限压单: 恢复明细 + 重算任务 + 失效缓存', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [
        { id: 10, task_id: 1, hold_type: 'time_limited', hold_until: '2026-06-01' },
        { id: 11, task_id: 1, hold_type: 'time_limited', hold_until: '2026-06-01' },
      ],
    });

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql.includes('COALESCE(SUM')) {
        return Promise.resolve({ rows: [{ total: '5000', cnt: '3', max_overdue: '10' }] });
      }
      if (sql === 'SELECT status FROM ar_collection_tasks WHERE id = $1') {
        return Promise.resolve({ rows: [{ status: 'collecting' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await checkHoldExpiry();

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');

    // 恢复明细状态
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'pending', hoard_tag = NULL"),
      [expect.arrayContaining([10, 11])]
    );

    // 重算任务
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('SET total_amount = $1, bill_count = $2'),
      [5000, 3, 10, 1]
    );

    // 缓存失效
    expect(mockInvalidateTaskCache).toHaveBeenCalledWith(1);
    expect(mockInvalidateStatsCache).toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });

  it('关闭任务因所有明细排除后重新打开', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ id: 10, task_id: 1, hold_type: 'time_limited', hold_until: '2026-06-01' }],
    });

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql.includes('COALESCE(SUM')) {
        return Promise.resolve({ rows: [{ total: '1000', cnt: '2', max_overdue: '5' }] });
      }
      if (sql === 'SELECT status FROM ar_collection_tasks WHERE id = $1') {
        return Promise.resolve({ rows: [{ status: 'closed' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await checkHoldExpiry();

    // 应重新打开任务
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'collecting'"),
      [1]
    );
  });

  it('事务内失败时ROLLBACK', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ id: 10, task_id: 1, hold_type: 'time_limited', hold_until: '2026-06-01' }],
    });

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql.includes("SET status = 'pending'")) return Promise.reject(new Error('Hold error'));
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await expect(checkHoldExpiry()).rejects.toThrow('Hold error');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('查询失败时抛出错误', async () => {
    mockAppQuery.mockRejectedValue(new Error('DB down'));
    await expect(checkHoldExpiry()).rejects.toThrow('DB down');
  });
});
