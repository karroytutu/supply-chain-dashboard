/**
 * 核销与延期操作单元测试
 * 测试: submitVerify, applyExtension, markDifference, confirmVerify
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));
jest.mock('../../erp-client/erp-debt.service', () => ({
  checkExistingBillIds: jest.fn(),
}));
jest.mock('../ar-collection.repository', () => ({
  invalidateTaskCache: jest.fn(),
  invalidateStatsCache: jest.fn(),
}));
jest.mock('../ar-collection-notify', () => ({
  sendCollectionNotification: jest.fn(),
  buildVerifyResultActionCard: jest.fn().mockReturnValue({ title: 'test', text: 'test' }),
}));
jest.mock('./shared-utils', () => ({
  logAction: jest.fn(),
}));

import { submitVerify, applyExtension, markDifference, confirmVerify } from './verify-extension';
import { appQuery, getAppClient } from '../../../db/appPool';
import { checkExistingBillIds } from '../../erp-client/erp-debt.service';
import { invalidateTaskCache, invalidateStatsCache } from '../ar-collection.repository';
import { sendCollectionNotification } from '../ar-collection-notify';
import { logAction } from './shared-utils';

const mockAppQuery = appQuery as jest.Mock;
const mockGetAppClient = getAppClient as jest.Mock;
const mockCheckExistingBillIds = checkExistingBillIds as jest.Mock;
const mockInvalidateTaskCache = invalidateTaskCache as jest.Mock;
const mockInvalidateStatsCache = invalidateStatsCache as jest.Mock;
const mockSendCollectionNotification = sendCollectionNotification as jest.Mock;
const mockLogAction = logAction as jest.Mock;

const operator = { id: 1, name: '张三', role: 'marketer' };

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
// submitVerify
// ============================================

describe('submitVerify', () => {
  it('成功提交核销(指定明细)', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'collecting', task_no: 'AR001' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await submitVerify(1, { detail_ids: [10, 11], remark: '已收款' } as any, operator);

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'pending_verify'"),
      expect.arrayContaining([1, 1, [10, 11]])
    );
    expect(mockInvalidateTaskCache).toHaveBeenCalledWith(1);
    expect(mockInvalidateStatsCache).toHaveBeenCalled();
    expect(mockLogAction).toHaveBeenCalledWith(1, [10, 11], 'verify', 'success', '已收款', operator);
    expect(client.release).toHaveBeenCalled();
  });

  it('成功提交核销(全部明细)', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'collecting', task_no: 'AR001' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await submitVerify(1, {} as any, operator);

    // 不传 detail_ids 时更新所有明细
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'pending_verify'"),
      [1, 1] // operator.id, taskId
    );
  });

  it('任务不存在时抛出错误', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await expect(submitVerify(999, {} as any, operator)).rejects.toThrow('催收任务不存在');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('任务状态不允许核销时抛出错误', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'closed', task_no: 'AR001' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await expect(submitVerify(1, {} as any, operator)).rejects.toThrow('不允许核销操作');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});

// ============================================
// applyExtension
// ============================================

describe('applyExtension', () => {
  it('成功申请延期', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'collecting', can_extend: true, task_no: 'AR001' }] });
      }
      if (sql.includes('INSERT INTO ar_extension_records')) {
        return Promise.resolve({ rows: [{ id: 100 }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await applyExtension(1, { extension_days: 15, remark: '需要时间' } as any, operator);

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ar_extension_records'),
      expect.any(Array)
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'extension'"),
      expect.any(Array)
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(mockInvalidateTaskCache).toHaveBeenCalledWith(1);
    expect(mockLogAction).toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });

  it('不可再延期时抛出错误', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'collecting', can_extend: false, task_no: 'AR001' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await expect(applyExtension(1, { extension_days: 10 } as any, operator)).rejects.toThrow('不可再次延期');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('延期天数超限(>30天)时抛出错误', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'collecting', can_extend: true, task_no: 'AR001' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await expect(applyExtension(1, { extension_days: 31 } as any, operator)).rejects.toThrow('1-30之间的整数');
  });

  it('延期天数非整数时抛出错误', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'collecting', can_extend: true, task_no: 'AR001' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await expect(applyExtension(1, { extension_days: 0 } as any, operator)).rejects.toThrow('1-30之间的整数');
  });

  it('指定明细ID时更新明细状态', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'collecting', can_extend: true, task_no: 'AR001' }] });
      }
      if (sql.includes('INSERT INTO ar_extension_records')) {
        return Promise.resolve({ rows: [{ id: 100 }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await applyExtension(1, { extension_days: 10, detail_ids: [20, 21] } as any, operator);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'extension'"),
      [1, [20, 21]]
    );
  });
});

// ============================================
// markDifference
// ============================================

describe('markDifference', () => {
  it('成功标记差异', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'collecting', task_no: 'AR001' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await markDifference(1, { detail_ids: [30], remark: '金额不符' } as any, operator);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'difference_processing'"),
      [1]
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'difference_pending'"),
      ['金额不符', 1, [30]]
    );
    expect(mockInvalidateTaskCache).toHaveBeenCalledWith(1);
    expect(mockLogAction).toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });

  it('任务状态不允许时抛出错误', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'closed', task_no: 'AR001' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await expect(markDifference(1, { remark: 'test' } as any, operator)).rejects.toThrow('不允许此操作');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('任务不存在时抛出错误', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await expect(markDifference(999, {} as any, operator)).rejects.toThrow('催收任务不存在');
  });
});

// ============================================
// confirmVerify
// ============================================

describe('confirmVerify', () => {
  it('确认核销 + ERP欠款已消失 → 关闭任务', async () => {
    // appQuery: 查询明细的 erp_bill_id
    mockAppQuery.mockResolvedValueOnce({ rows: [{ erp_bill_id: 'B1' }] });
    mockCheckExistingBillIds.mockResolvedValue(new Set()); // ERP中不存在

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'pending_verify', task_no: 'AR001', consumer_name: '客户A' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    // appQuery: 查询提交人
    mockAppQuery.mockResolvedValueOnce({ rows: [{ processed_by: 5 }] });

    await confirmVerify(1, { confirmed: true, detail_ids: [] } as any, operator);

    // 应关闭任务(allErpBillsGone)
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = $1"),
      ['closed', 1]
    );
    expect(mockLogAction).toHaveBeenCalledWith(
      1, [], 'confirm_verify', 'success',
      '核销确认通过，ERP欠款已结清，系统自动关闭任务',
      operator
    );
    // 发送通知
    expect(mockSendCollectionNotification).toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });

  it('确认核销 + ERP欠款仍存在 → verified状态', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [{ erp_bill_id: 'B1' }] });
    mockCheckExistingBillIds.mockResolvedValue(new Set(['B1'])); // ERP中存在

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'pending_verify', task_no: 'AR001', consumer_name: '客户A' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);
    mockAppQuery.mockResolvedValueOnce({ rows: [] }); // 无提交人

    await confirmVerify(1, { confirmed: true, detail_ids: [], remark: '确认' } as any, operator);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = $1"),
      ['verified', 1]
    );
  });

  it('拒绝核销 → 恢复collecting状态', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'pending_verify', task_no: 'AR001', consumer_name: '客户A' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await confirmVerify(1, { confirmed: false, detail_ids: [], remark: '金额不对' } as any, operator);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'collecting'"),
      [1]
    );
    expect(mockLogAction).toHaveBeenCalledWith(
      1, [], 'confirm_verify', 'failed', '金额不对', operator
    );
  });

  it('任务状态不是pending_verify时抛出错误', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [] }); // ERP bill check (confirmed=true)

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'collecting', task_no: 'AR001' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await expect(confirmVerify(1, { confirmed: true, detail_ids: [] } as any, operator)).rejects.toThrow('不允许确认核销');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('任务不存在时抛出错误(confirmVerify)', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [] }); // ERP bill check (confirmed=true)

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await expect(confirmVerify(999, { confirmed: true, detail_ids: [] } as any, operator)).rejects.toThrow('催收任务不存在');
  });

  it('ERP检查失败时按常规核销处理', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [{ erp_bill_id: 'B1' }] });
    mockCheckExistingBillIds.mockRejectedValue(new Error('ERP down'));

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'pending_verify', task_no: 'AR001', consumer_name: '客户A' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);
    mockAppQuery.mockResolvedValueOnce({ rows: [] });

    // 不应抛出
    await confirmVerify(1, { confirmed: true, detail_ids: [], remark: 'ok' } as any, operator);

    // allErpBillsGone=false, 应为verified
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = $1"),
      ['verified', 1]
    );
  });

  it('通知失败不影响核销流程', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [{ erp_bill_id: 'B1' }] });
    mockCheckExistingBillIds.mockResolvedValue(new Set());

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT * FROM ar_collection_tasks')) {
        return Promise.resolve({ rows: [{ id: 1, status: 'pending_verify', task_no: 'AR001', consumer_name: '客户A' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);
    mockAppQuery.mockResolvedValueOnce({ rows: [{ processed_by: 5 }] });
    mockSendCollectionNotification.mockRejectedValue(new Error('Notify failed'));

    // 不应抛出
    await confirmVerify(1, { confirmed: true, detail_ids: [] } as any, operator);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});
