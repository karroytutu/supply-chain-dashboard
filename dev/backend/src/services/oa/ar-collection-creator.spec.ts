/**
 * 催收OA实例创建定时任务 测试
 * @module services/oa/ar-collection-creator.spec
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));

jest.mock('../erp-client/erp-debt.service', () => ({
  fetchAllErpDebts: jest.fn(),
}));

jest.mock('../ar-collection/ar-debt-enrichment.service', () => ({
  enrichDebtRecords: jest.fn(),
  filterHoardDebts: jest.fn(),
}));

jest.mock('../ar-collection/ar-collection-entry-rules', () => ({
  evaluateEntryRules: jest.fn(),
  extractEntryMetadata: jest.fn(),
  COLLECTION_ENTRY_RULES: {},
}));

jest.mock('./form-types', () => ({
  getFormTypeByCode: jest.fn(),
}));

jest.mock('./oa-utils', () => ({
  generateInstanceNo: jest.fn().mockResolvedValue('OA-TEST-001'),
}));

import { appQuery, getAppClient } from '../../db/appPool';
import { fetchAllErpDebts } from '../erp-client/erp-debt.service';
import { enrichDebtRecords, filterHoardDebts } from '../ar-collection/ar-debt-enrichment.service';
import { evaluateEntryRules, extractEntryMetadata } from '../ar-collection/ar-collection-entry-rules';
import { getFormTypeByCode } from './form-types';
import { generateInstanceNo } from './oa-utils';
import { createMockPoolClient, mockQueryResult } from '../../__tests__/helpers/mockDb';
import { generateCollectionOaInstances } from './ar-collection-creator';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetAppClient = getAppClient as jest.MockedFunction<typeof getAppClient>;
const mockFetchAllErpDebts = fetchAllErpDebts as jest.MockedFunction<typeof fetchAllErpDebts>;
const mockEnrichDebtRecords = enrichDebtRecords as jest.MockedFunction<typeof enrichDebtRecords>;
const mockFilterHoardDebts = filterHoardDebts as jest.MockedFunction<typeof filterHoardDebts>;
const mockEvaluateEntryRules = evaluateEntryRules as jest.MockedFunction<typeof evaluateEntryRules>;
const mockExtractEntryMetadata = extractEntryMetadata as jest.MockedFunction<typeof extractEntryMetadata>;
const mockGetFormTypeByCode = getFormTypeByCode as jest.MockedFunction<typeof getFormTypeByCode>;

/** 构造一个可复用的 mock lock client */
function createLockClient(locked = true) {
  const lockClient = createMockPoolClient();
  (lockClient.query as jest.Mock)
    .mockResolvedValueOnce({ rows: [{ locked }], rowCount: 1 });
  return lockClient;
}

/** 设置完整流水线的 mock（到创建实例之前） */
function setupFullPipeline(debts: any[] = []) {
  mockFetchAllErpDebts.mockResolvedValue(debts.length > 0 ? debts : [{ billId: 'B1' }] as any);
  mockEnrichDebtRecords.mockResolvedValue(
    debts.length > 0 ? debts : [{ consumerName: '张三', leftAmount: 1000, overdueDays: 10, workTime: '2026-05-01', settleMethod: 1, billId: 'B1', billTypeName: '销售单', totalAmount: 2000 }] as any
  );
  mockFilterHoardDebts.mockReturnValue(
    debts.length > 0 ? debts : [{ consumerName: '张三', leftAmount: 1000, overdueDays: 10, workTime: '2026-05-01', settleMethod: 1, billId: 'B1', billTypeName: '销售单', totalAmount: 2000 }] as any
  );
  mockEvaluateEntryRules.mockReturnValue([] as any);
  mockExtractEntryMetadata.mockReturnValue({
    enteringDebts: [{ consumerName: '张三', leftAmount: 1000, overdueDays: 10, workTime: '2026-05-01', settleMethod: 1, billId: 'B1', billTypeName: '销售单', totalAmount: 2000 }] as any,
    entryReasons: ['overdue_days'] as any,
    entryRuleSnapshot: {} as any,
  } as any);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// Advisory Lock
// =====================================================

describe('generateCollectionOaInstances - Advisory Lock', () => {
  it('Lock 获取失败时跳过执行', async () => {
    const lockClient = createLockClient(false);
    mockGetAppClient.mockResolvedValue(lockClient);

    await generateCollectionOaInstances();

    expect(mockFetchAllErpDebts).not.toHaveBeenCalled();
  });

  it('Lock 获取成功后正常执行', async () => {
    const lockClient = createLockClient(true);
    // unlock
    (lockClient.query as jest.Mock).mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    mockGetAppClient.mockResolvedValue(lockClient);
    mockFetchAllErpDebts.mockResolvedValue([]);

    await generateCollectionOaInstances();

    expect(mockFetchAllErpDebts).toHaveBeenCalled();
  });

  it('执行完毕后释放 Lock 和 client', async () => {
    const lockClient = createLockClient(true);
    (lockClient.query as jest.Mock).mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    mockGetAppClient.mockResolvedValue(lockClient);
    mockFetchAllErpDebts.mockResolvedValue([]);

    await generateCollectionOaInstances();

    expect(lockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock'),
      expect.any(Array)
    );
    expect(lockClient.release).toHaveBeenCalled();
  });

  it('内部异常时仍释放 Lock', async () => {
    const lockClient = createLockClient(true);
    (lockClient.query as jest.Mock).mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    mockGetAppClient.mockResolvedValue(lockClient);
    mockFetchAllErpDebts.mockRejectedValue(new Error('ERP connection failed'));

    // 异常会向上抛出（finally 中仍释放 lock）
    await expect(generateCollectionOaInstances()).rejects.toThrow('ERP connection failed');

    // 验证 unlock 和 release 仍被调用
    expect(lockClient.release).toHaveBeenCalled();
  });
});

// =====================================================
// 核心流水线
// =====================================================

describe('generateCollectionOaInstances - 核心流水线', () => {
  function setupLockAndUnlock() {
    const lockClient = createMockPoolClient();
    (lockClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ locked: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    return lockClient;
  }

  it('ERP 无欠款时提前返回', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);
    mockFetchAllErpDebts.mockResolvedValue([]);

    await generateCollectionOaInstances();

    expect(mockEnrichDebtRecords).not.toHaveBeenCalled();
  });

  it('排除压单后无 eligible 时提前返回', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);
    mockFetchAllErpDebts.mockResolvedValue([{ billId: 'B1' }] as any);
    mockEnrichDebtRecords.mockResolvedValue([{ consumerName: '张三' }] as any);
    mockFilterHoardDebts.mockReturnValue([]);

    await generateCollectionOaInstances();

    expect(mockEvaluateEntryRules).not.toHaveBeenCalled();
  });

  it('准入规则后无入催时提前返回', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);
    mockFetchAllErpDebts.mockResolvedValue([{ billId: 'B1' }] as any);
    mockEnrichDebtRecords.mockResolvedValue([{ consumerName: '张三' }] as any);
    mockFilterHoardDebts.mockReturnValue([{ consumerName: '张三' }] as any);
    mockEvaluateEntryRules.mockReturnValue([] as any);
    mockExtractEntryMetadata.mockReturnValue({ enteringDebts: [], entryReasons: [], entryRuleSnapshot: {} as any } as any);

    await generateCollectionOaInstances();

    expect(mockGetFormTypeByCode).not.toHaveBeenCalled();
  });

  it('系统用户不存在时提前返回', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);
    setupFullPipeline();

    // mock appQuery for system user → empty
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([])) // queryExistingOaInstances
      .mockResolvedValueOnce(mockQueryResult([])); // getSystemUser

    await generateCollectionOaInstances();

    expect(generateInstanceNo).not.toHaveBeenCalled();
  });

  it('表单类型不存在时提前返回', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);
    setupFullPipeline();
    mockGetFormTypeByCode.mockReturnValue(undefined);

    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([])) // queryExistingOaInstances
      .mockResolvedValueOnce(mockQueryResult([{ id: 1, name: '系统', department_name: '技术部' }])); // getSystemUser

    await generateCollectionOaInstances();

    expect(generateInstanceNo).not.toHaveBeenCalled();
  });

  it('完整流水线：正常创建 OA 实例', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);
    setupFullPipeline();

    mockGetFormTypeByCode.mockReturnValue({ code: 'ar_collection', name: '逾期催收' } as any);

    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([])) // queryExistingOaInstances
      .mockResolvedValueOnce(mockQueryResult([{ id: 1, name: '系统', department_name: '技术部' }])); // getSystemUser

    // createBatchOaInstances 调用 getAppClient 获取事务 client
    const batchClient = createMockPoolClient();
    (batchClient.query as jest.Mock).mockResolvedValue({ rows: [{ id: 100 }], rowCount: 1 });
    mockGetAppClient.mockResolvedValueOnce(lockClient).mockResolvedValueOnce(batchClient);

    await generateCollectionOaInstances();

    expect(generateInstanceNo).toHaveBeenCalled();
    // 验证事务中有 INSERT 操作
    const insertCalls = (batchClient.query as jest.Mock).mock.calls.filter(
      (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO oa_approval_instances')
    );
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('同客户多笔欠款聚合为 1 个实例', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);

    const debt1 = { consumerName: '张三', leftAmount: 500, overdueDays: 10, workTime: '2026-05-01', settleMethod: 1, billId: 'B1', billTypeName: '销售单', totalAmount: 1000 };
    const debt2 = { consumerName: '张三', leftAmount: 300, overdueDays: 15, workTime: '2026-05-01', settleMethod: 1, billId: 'B2', billTypeName: '销售单', totalAmount: 800 };

    mockFetchAllErpDebts.mockResolvedValue([debt1, debt2] as any);
    mockEnrichDebtRecords.mockResolvedValue([debt1, debt2] as any);
    mockFilterHoardDebts.mockReturnValue([debt1, debt2] as any);
    mockEvaluateEntryRules.mockReturnValue([] as any);
    mockExtractEntryMetadata.mockReturnValue({ enteringDebts: [debt1, debt2] as any, entryReasons: ['overdue_days'] as any, entryRuleSnapshot: {} as any } as any);
    mockGetFormTypeByCode.mockReturnValue({ code: 'ar_collection', name: '逾期催收' } as any);

    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([]))
      .mockResolvedValueOnce(mockQueryResult([{ id: 1, name: '系统', department_name: null }]));

    const batchClient = createMockPoolClient();
    (batchClient.query as jest.Mock).mockResolvedValue({ rows: [{ id: 100 }], rowCount: 1 });
    mockGetAppClient.mockResolvedValueOnce(lockClient).mockResolvedValueOnce(batchClient);

    await generateCollectionOaInstances();

    // 同客户 → 只应创建 1 个实例（1次 INSERT INTO oa_approval_instances）
    const insertCalls = (batchClient.query as jest.Mock).mock.calls.filter(
      (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO oa_approval_instances')
    );
    expect(insertCalls.length).toBe(1);
  });
});

// =====================================================
// 去重逻辑
// =====================================================

describe('generateCollectionOaInstances - 去重', () => {
  it('已有未完成实例时去重查询被调用', async () => {
    const lockClient = createMockPoolClient();
    (lockClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ locked: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    mockGetAppClient.mockResolvedValue(lockClient);
    setupFullPipeline();
    mockGetFormTypeByCode.mockReturnValue({ code: 'ar_collection', name: '逾期催收' } as any);

    // queryExistingOaInstances 返回空（无已有实例）
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([]))
      .mockResolvedValueOnce(mockQueryResult([{ id: 1, name: '系统', department_name: null }]));

    const batchClient = createMockPoolClient();
    (batchClient.query as jest.Mock).mockResolvedValue({ rows: [{ id: 100 }], rowCount: 1 });
    // 先重置再设置 once 序列
    mockGetAppClient.mockReset();
    mockGetAppClient
      .mockResolvedValueOnce(lockClient)
      .mockResolvedValueOnce(batchClient);

    await generateCollectionOaInstances();

    // 查询去重数据的 SQL 被调用
    expect(mockAppQuery).toHaveBeenCalled();
  });
});

// =====================================================
// 事务容错
// =====================================================

describe('generateCollectionOaInstances - 事务容错', () => {
  it('事务级异常被捕获不抛出', async () => {
    const lockClient = createMockPoolClient();
    (lockClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ locked: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    mockGetAppClient.mockResolvedValue(lockClient);
    setupFullPipeline();
    mockGetFormTypeByCode.mockReturnValue({ code: 'ar_collection', name: '逾期催收' } as any);

    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([]))
      .mockResolvedValueOnce(mockQueryResult([{ id: 1, name: '系统', department_name: null }]));

    const batchClient = createMockPoolClient();
    // BEGIN 正常，之后 INSERT 抛异常
    (batchClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockRejectedValueOnce(new Error('INSERT failed')); // INSERT fails

    mockGetAppClient.mockReset();
    mockGetAppClient
      .mockResolvedValueOnce(lockClient)
      .mockResolvedValueOnce(batchClient);

    // 不应抛出异常（内部捕获）
    await expect(generateCollectionOaInstances()).resolves.not.toThrow();
  });
});
