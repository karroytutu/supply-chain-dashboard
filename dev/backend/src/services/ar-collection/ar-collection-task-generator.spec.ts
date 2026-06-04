/**
 * 催收任务生成服务单元测试
 * 测试 generateCollectionTasks 及其管线
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));
jest.mock('../erp-client/erp-debt.service', () => ({
  fetchAllErpDebts: jest.fn(),
}));
jest.mock('./ar-debt-enrichment.service', () => ({
  enrichDebtRecords: jest.fn(),
  filterHoardDebts: jest.fn(),
}));
jest.mock('./ar-collection-entry-rules', () => ({
  evaluateEntryRules: jest.fn(),
  extractEntryMetadata: jest.fn(),
  COLLECTION_ENTRY_RULES: {},
}));
jest.mock('./ar-collection-notify-task', () => ({
  sendTaskCreatedNotifications: jest.fn(),
}));
jest.mock('./ar-collection.utils', () => ({
  calcPriority: jest.fn().mockReturnValue('medium'),
}));
jest.mock('./ar-collection-batch-query', () => ({
  batchQueryExistingBillIds: jest.fn(),
  batchQueryActiveTasks: jest.fn(),
}));

import { generateCollectionTasks } from './ar-collection-task-generator';
import { getAppClient } from '../../db/appPool';
import { fetchAllErpDebts } from '../erp-client/erp-debt.service';
import { enrichDebtRecords, filterHoardDebts } from './ar-debt-enrichment.service';
import {
  evaluateEntryRules,
  extractEntryMetadata,
  COLLECTION_ENTRY_RULES,
} from './ar-collection-entry-rules';
import { sendTaskCreatedNotifications } from './ar-collection-notify-task';
import { calcPriority } from './ar-collection.utils';
import { batchQueryExistingBillIds, batchQueryActiveTasks } from './ar-collection-batch-query';

const mockGetAppClient = getAppClient as jest.Mock;
const mockFetchAllErpDebts = fetchAllErpDebts as jest.Mock;
const mockEnrichDebtRecords = enrichDebtRecords as jest.Mock;
const mockFilterHoardDebts = filterHoardDebts as jest.Mock;
const mockEvaluateEntryRules = evaluateEntryRules as jest.Mock;
const mockExtractEntryMetadata = extractEntryMetadata as jest.Mock;
const mockSendTaskCreatedNotifications = sendTaskCreatedNotifications as jest.Mock;
const mockCalcPriority = calcPriority as jest.Mock;
const mockBatchQueryExistingBillIds = batchQueryExistingBillIds as jest.Mock;
const mockBatchQueryActiveTasks = batchQueryActiveTasks as jest.Mock;

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
// generateCollectionTasks - Advisory Lock
// ============================================

describe('generateCollectionTasks - Advisory Lock', () => {
  it('获取锁失败时跳过执行', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) {
        return Promise.resolve({ rows: [{ locked: false }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await generateCollectionTasks();

    // 不应获取锁后的逻辑
    expect(mockFetchAllErpDebts).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('pg_advisory_unlock'), expect.anything());
    expect(client.release).toHaveBeenCalled();
  });

  it('获取锁成功后执行并最终释放锁', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) {
        return Promise.resolve({ rows: [{ locked: true }] });
      }
      if (sql.includes('pg_advisory_unlock')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);
    mockFetchAllErpDebts.mockResolvedValue([]);
    mockEnrichDebtRecords.mockResolvedValue([]);
    mockFilterHoardDebts.mockReturnValue([]);
    mockEvaluateEntryRules.mockReturnValue([]);
    mockExtractEntryMetadata.mockReturnValue({ enteringDebts: [], entryReasons: [], entryRuleSnapshot: {} });

    await generateCollectionTasks();

    expect(mockFetchAllErpDebts).toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock'),
      expect.anything()
    );
    expect(client.release).toHaveBeenCalled();
  });
});

// ============================================
// generateCollectionTasks - 管线逻辑
// ============================================

describe('generateCollectionTasks - Pipeline', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) return Promise.resolve({ rows: [{ locked: true }] });
      if (sql.includes('pg_advisory_unlock')) return Promise.resolve({ rows: [] });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return Promise.resolve({ rows: [] });
      if (sql.includes('task_no LIKE')) return Promise.resolve({ rows: [] });
      if (sql.includes('SELECT id FROM users')) return Promise.resolve({ rows: [{ id: 99 }] });
      if (sql.includes('INSERT INTO ar_collection_tasks')) return Promise.resolve({ rows: [{ id: 1 }] });
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);
  });

  it('无新增需催收欠款时提前返回', async () => {
    mockFetchAllErpDebts.mockResolvedValue([{ billId: 'B1' }]);
    mockEnrichDebtRecords.mockResolvedValue([{ billId: 'B1' }]);
    mockFilterHoardDebts.mockReturnValue([{ billId: 'B1' }]);
    mockEvaluateEntryRules.mockReturnValue([]);
    mockExtractEntryMetadata.mockReturnValue({ enteringDebts: [], entryReasons: [], entryRuleSnapshot: {} });
    mockBatchQueryExistingBillIds.mockResolvedValue(new Set());

    await generateCollectionTasks();

    // 不应进入事务创建任务
    expect(client.query).not.toHaveBeenCalledWith('BEGIN');
  });

  it('已有billId被排除(幂等)', async () => {
    const debt = { billId: 'EXISTING', consumerName: '客户A', leftAmount: 100, overdueDays: 5, overdueDateStr: '2026-06-01', managerUsers: '张三' };
    mockFetchAllErpDebts.mockResolvedValue([debt]);
    mockEnrichDebtRecords.mockResolvedValue([debt]);
    mockFilterHoardDebts.mockReturnValue([debt]);
    mockEvaluateEntryRules.mockReturnValue([{ debt, triggeredRules: [] }]);
    mockExtractEntryMetadata.mockReturnValue({
      enteringDebts: [debt],
      entryReasons: ['overdue_days'],
      entryRuleSnapshot: {},
    });
    mockBatchQueryExistingBillIds.mockResolvedValue(new Set(['EXISTING']));

    await generateCollectionTasks();

    // 因为 billId 已存在，qualifiedDebts 为空
    expect(client.query).not.toHaveBeenCalledWith('BEGIN');
  });

  it('成功生成任务: 含事务 + 插入明细 + 通知', async () => {
    const debt = {
      billId: 'NEW1', consumerName: '客户A', leftAmount: 1000, overdueDays: 10,
      overdueDateStr: '2026-06-01', managerUsers: '张三', billTypeName: '销售单',
      workTime: '2026-05-01', bizOrderStr: 'ORD001', settleMethod: 1, consumerExpireDay: 7,
    };
    mockFetchAllErpDebts.mockResolvedValue([debt]);
    mockEnrichDebtRecords.mockResolvedValue([debt]);
    mockFilterHoardDebts.mockReturnValue([debt]);
    mockEvaluateEntryRules.mockReturnValue([{ debt, triggeredRules: [{ triggeredRule: 'overdue_days', reason: '逾期10天' }] }]);
    mockExtractEntryMetadata.mockReturnValue({
      enteringDebts: [debt],
      entryReasons: ['overdue_days'],
      entryRuleSnapshot: { overdue_days: { threshold: 5 } },
    });
    mockBatchQueryExistingBillIds.mockResolvedValue(new Set());
    mockBatchQueryActiveTasks.mockResolvedValue(new Map());

    await generateCollectionTasks();

    // 事务开始
    expect(client.query).toHaveBeenCalledWith('BEGIN');

    // 插入任务
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ar_collection_tasks'),
      expect.any(Array)
    );

    // 插入明细
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ar_collection_details'),
      expect.any(Array)
    );

    // 事务提交
    expect(client.query).toHaveBeenCalledWith('COMMIT');

    // 发送通知
    expect(mockSendTaskCreatedNotifications).toHaveBeenCalled();
  });

  it('已有活跃任务时跳过该组', async () => {
    const debt = {
      billId: 'NEW2', consumerName: '客户B', leftAmount: 500, overdueDays: 5,
      overdueDateStr: '2026-06-01', managerUsers: null, billTypeName: '销售单',
      workTime: '2026-05-15', bizOrderStr: '', settleMethod: 1, consumerExpireDay: 7,
    };
    mockFetchAllErpDebts.mockResolvedValue([debt]);
    mockEnrichDebtRecords.mockResolvedValue([debt]);
    mockFilterHoardDebts.mockReturnValue([debt]);
    mockEvaluateEntryRules.mockReturnValue([{ debt, triggeredRules: [] }]);
    mockExtractEntryMetadata.mockReturnValue({
      enteringDebts: [debt],
      entryReasons: ['overdue_days'],
      entryRuleSnapshot: {},
    });
    mockBatchQueryExistingBillIds.mockResolvedValue(new Set());
    // 模拟已有活跃任务
    mockBatchQueryActiveTasks.mockResolvedValue(new Map([['客户B||2026-06-01', 5]]));

    await generateCollectionTasks();

    // 事务仍然开始（因为有组要处理），但该组被跳过
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');

    // 不应插入任务
    const insertTaskCalls = client.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO ar_collection_tasks')
    );
    expect(insertTaskCalls).toHaveLength(0);
  });

  it('管线中异常时ROLLBACK并抛出', async () => {
    mockFetchAllErpDebts.mockRejectedValue(new Error('ERP failure'));

    await expect(generateCollectionTasks()).rejects.toThrow('ERP failure');

    // 应尝试ROLLBACK
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('通知失败不影响任务生成', async () => {
    const debt = {
      billId: 'NEW3', consumerName: '客户C', leftAmount: 200, overdueDays: 3,
      overdueDateStr: '2026-06-01', managerUsers: null, billTypeName: '销售单',
      workTime: '2026-05-20', bizOrderStr: '', settleMethod: 1, consumerExpireDay: 7,
    };
    mockFetchAllErpDebts.mockResolvedValue([debt]);
    mockEnrichDebtRecords.mockResolvedValue([debt]);
    mockFilterHoardDebts.mockReturnValue([debt]);
    mockEvaluateEntryRules.mockReturnValue([{ debt, triggeredRules: [] }]);
    mockExtractEntryMetadata.mockReturnValue({
      enteringDebts: [debt],
      entryReasons: ['overdue_days'],
      entryRuleSnapshot: {},
    });
    mockBatchQueryExistingBillIds.mockResolvedValue(new Set());
    mockBatchQueryActiveTasks.mockResolvedValue(new Map());
    mockSendTaskCreatedNotifications.mockRejectedValue(new Error('Notify failed'));

    // 不应抛出
    await generateCollectionTasks();

    // 事务仍然成功
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});

// ============================================
// generateCollectionTasks - 序号生成
// ============================================

describe('generateCollectionTasks - 序号生成', () => {
  it('今日已有任务时递增序号', async () => {
    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) return Promise.resolve({ rows: [{ locked: true }] });
      if (sql.includes('pg_advisory_unlock')) return Promise.resolve({ rows: [] });
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('task_no LIKE')) return Promise.resolve({ rows: [{ max_seq: 'AR20260604003' }] });
      if (sql.includes('INSERT INTO ar_collection_tasks')) return Promise.resolve({ rows: [{ id: 10 }] });
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    const debt = {
      billId: 'SEQ1', consumerName: '客户D', leftAmount: 100, overdueDays: 5,
      overdueDateStr: '2026-06-04', managerUsers: null, billTypeName: '销售单',
      workTime: '2026-05-30', bizOrderStr: '', settleMethod: 1, consumerExpireDay: 7,
    };
    mockFetchAllErpDebts.mockResolvedValue([debt]);
    mockEnrichDebtRecords.mockResolvedValue([debt]);
    mockFilterHoardDebts.mockReturnValue([debt]);
    mockEvaluateEntryRules.mockReturnValue([{ debt, triggeredRules: [] }]);
    mockExtractEntryMetadata.mockReturnValue({
      enteringDebts: [debt],
      entryReasons: ['overdue_days'],
      entryRuleSnapshot: {},
    });
    mockBatchQueryExistingBillIds.mockResolvedValue(new Set());
    mockBatchQueryActiveTasks.mockResolvedValue(new Map());

    await generateCollectionTasks();

    // 验证 taskNo 应为 AR20260604004 (3+1=4, padStart(3) = '004')
    const insertCall = client.query.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO ar_collection_tasks')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1][0]).toBe('AR20260604004');
  });
});
