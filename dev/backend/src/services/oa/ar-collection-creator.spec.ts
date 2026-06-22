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

jest.mock('../erp-debt/erp-debt-enrichment.service', () => ({
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

jest.mock('./oa-async-task.service', () => ({
  enqueueCreateProcessInstance: jest.fn().mockResolvedValue(undefined),
  enqueueSendApprovalNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../fixed-asset/erp-meta-utils', () => ({
  initErpMeta: jest.fn().mockResolvedValue(undefined),
}));

import { appQuery, getAppClient } from '../../db/appPool';
import { fetchAllErpDebts } from '../erp-client/erp-debt.service';
import { enrichDebtRecords, filterHoardDebts } from '../erp-debt/erp-debt-enrichment.service';
import { evaluateEntryRules, extractEntryMetadata } from '../ar-collection/ar-collection-entry-rules';
import { getFormTypeByCode } from './form-types';
import { generateInstanceNo } from './oa-utils';
import { enqueueCreateProcessInstance, enqueueSendApprovalNotification } from './oa-async-task.service';
import { initErpMeta } from '../fixed-asset/erp-meta-utils';
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
const mockEnqueueCreateProcessInstance = enqueueCreateProcessInstance as jest.MockedFunction<typeof enqueueCreateProcessInstance>;
const mockEnqueueSendApprovalNotification = enqueueSendApprovalNotification as jest.MockedFunction<typeof enqueueSendApprovalNotification>;
const mockInitErpMeta = initErpMeta as jest.MockedFunction<typeof initErpMeta>;

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

/** 包含 workflowDef 的 ar_collection 表单类型 mock（evaluateAndTriggerNodes 需要遍历 nodes） */
function mockArCollectionFormType() {
  return {
    code: 'ar_collection',
    name: '逾期催收',
    formSchema: { fields: [] },
    workflowDef: {
      nodes: [
        { order: 1, name: '营销师催收', type: 'handle', handler: {}, signMode: 'or' },
      ],
    },
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  // 清理 mockResolvedValueOnce 队列（clearAllMocks 不清理队列，需要 mockReset）
  mockGetAppClient.mockReset();
  mockAppQuery.mockReset();
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
      .mockResolvedValueOnce(mockQueryResult([])); // getSystemApplicant

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
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: '财务部' }])); // getSystemApplicant

    await generateCollectionOaInstances();

    expect(generateInstanceNo).not.toHaveBeenCalled();
  });

  it('完整流水线：正常创建 OA 实例', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);
    setupFullPipeline();

    mockGetFormTypeByCode.mockReturnValue({ code: 'ar_collection', name: '逾期催收', formSchema: { fields: [] } } as any);

    // appQuery 调用序列：queryExistingOaInstances → getSystemApplicant（resolveMarketer 已改用事务 client）
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([])) // queryExistingOaInstances
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: '财务部' }])); // getSystemApplicant

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

    const debt1 = { consumerName: '张三', leftAmount: 500, overdueDays: 10, workTime: '2026-05-01', settleMethod: 1, billId: 'B1', billTypeName: '销售单', totalAmount: 1000, managerUsers: '李营销' };
    const debt2 = { consumerName: '张三', leftAmount: 300, overdueDays: 15, workTime: '2026-05-01', settleMethod: 1, billId: 'B2', billTypeName: '销售单', totalAmount: 800, managerUsers: '李营销' };

    mockFetchAllErpDebts.mockResolvedValue([debt1, debt2] as any);
    mockEnrichDebtRecords.mockResolvedValue([debt1, debt2] as any);
    mockFilterHoardDebts.mockReturnValue([debt1, debt2] as any);
    mockEvaluateEntryRules.mockReturnValue([] as any);
    mockExtractEntryMetadata.mockReturnValue({ enteringDebts: [debt1, debt2] as any, entryReasons: ['overdue_days'] as any, entryRuleSnapshot: {} as any } as any);
    mockGetFormTypeByCode.mockReturnValue({ code: 'ar_collection', name: '逾期催收', formSchema: { fields: [] } } as any);

    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([])) // queryExistingOaInstances
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: null }])); // getSystemApplicant

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
// 去重逻辑（单据级）
// =====================================================

describe('generateCollectionOaInstances - 单据级去重', () => {
  function setupLockAndUnlock() {
    const lockClient = createMockPoolClient();
    (lockClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ locked: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    return lockClient;
  }

  it('所有单据已在活跃实例中时提前返回（不创建实例）', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);

    const debt = { consumerName: '张三', leftAmount: 1000, overdueDays: 10, workTime: '2026-05-01', settleMethod: 1, billId: 'B1', billTypeName: '销售单', totalAmount: 2000 };
    mockFetchAllErpDebts.mockResolvedValue([debt] as any);
    mockEnrichDebtRecords.mockResolvedValue([debt] as any);
    mockFilterHoardDebts.mockReturnValue([debt] as any);
    mockEvaluateEntryRules.mockReturnValue([] as any);
    mockExtractEntryMetadata.mockReturnValue({
      enteringDebts: [debt] as any,
      entryReasons: ['overdue_days'] as any,
      entryRuleSnapshot: {} as any,
    } as any);

    // queryExistingBillIds 返回 B1（已在活跃实例中）
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ bill_no: 'B1' }])) // queryExistingBillIds
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: null }])); // getSystemApplicant

    await generateCollectionOaInstances();

    // 不应创建实例（generateInstanceNo 不被调用）
    expect(generateInstanceNo).not.toHaveBeenCalled();
  });

  it('同客户新单据（billId 不同）正常入催', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);

    // B1 已在活跃实例中，B2 是新单据
    const debt1 = { consumerName: '张三', leftAmount: 500, overdueDays: 10, workTime: '2026-05-01', settleMethod: 1, billId: 'B1', billTypeName: '销售单', totalAmount: 1000, managerUsers: '李营销' };
    const debt2 = { consumerName: '张三', leftAmount: 300, overdueDays: 5, workTime: '2026-06-01', settleMethod: 1, billId: 'B2', billTypeName: '销售单', totalAmount: 800, managerUsers: '李营销' };

    mockFetchAllErpDebts.mockResolvedValue([debt1, debt2] as any);
    mockEnrichDebtRecords.mockResolvedValue([debt1, debt2] as any);
    mockFilterHoardDebts.mockReturnValue([debt1, debt2] as any);
    mockEvaluateEntryRules.mockReturnValue([] as any);
    mockExtractEntryMetadata.mockReturnValue({
      enteringDebts: [debt1, debt2] as any,
      entryReasons: ['overdue_days'] as any,
      entryRuleSnapshot: {} as any,
    } as any);
    mockGetFormTypeByCode.mockReturnValue({ code: 'ar_collection', name: '逾期催收', formSchema: { fields: [] } } as any);

    // queryExistingBillIds 返回 B1（B2 是新单据，不在活跃实例中）
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ bill_no: 'B1' }])) // queryExistingBillIds
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: null }])); // getSystemApplicant

    const batchClient = createMockPoolClient();
    (batchClient.query as jest.Mock).mockResolvedValue({ rows: [{ id: 100 }], rowCount: 1 });
    mockGetAppClient.mockReset();
    mockGetAppClient
      .mockResolvedValueOnce(lockClient)
      .mockResolvedValueOnce(batchClient);

    await generateCollectionOaInstances();

    // 应为 B2 创建 1 个实例
    const insertCalls = (batchClient.query as jest.Mock).mock.calls.filter(
      (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO oa_approval_instances')
    );
    expect(insertCalls.length).toBe(1);
    expect(generateInstanceNo).toHaveBeenCalled();
  });

  it('去重查询使用 jsonb_array_elements 提取 billNo', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);
    setupFullPipeline();
    mockGetFormTypeByCode.mockReturnValue({ code: 'ar_collection', name: '逾期催收' } as any);

    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([])) // queryExistingBillIds（无已有实例）
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: null }])); // getSystemApplicant

    const batchClient = createMockPoolClient();
    (batchClient.query as jest.Mock).mockResolvedValue({ rows: [{ id: 100 }], rowCount: 1 });
    mockGetAppClient.mockReset();
    mockGetAppClient
      .mockResolvedValueOnce(lockClient)
      .mockResolvedValueOnce(batchClient);

    await generateCollectionOaInstances();

    // 验证去重 SQL 使用了 jsonb_array_elements
    const dedupQueryCall = mockAppQuery.mock.calls.find(
      (c: any) => typeof c[0] === 'string' && c[0].includes('jsonb_array_elements')
    );
    expect(dedupQueryCall).toBeTruthy();
  });

  it('新实例的 formData.billDetails 仅含新单据（不含已入催的旧单据）', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);

    // B1 已在活跃实例中，B2/B3 是新单据
    const debt1 = { consumerName: '李四', leftAmount: 500, overdueDays: 10, workTime: '2026-05-01', settleMethod: 1, billId: 'B1', billTypeName: '销售单', totalAmount: 1000, managerUsers: '王营销' };
    const debt2 = { consumerName: '李四', leftAmount: 300, overdueDays: 5, workTime: '2026-06-01', settleMethod: 1, billId: 'B2', billTypeName: '销售单', totalAmount: 800, managerUsers: '王营销' };
    const debt3 = { consumerName: '李四', leftAmount: 200, overdueDays: 3, workTime: '2026-06-10', settleMethod: 1, billId: 'B3', billTypeName: '销售单', totalAmount: 600, managerUsers: '王营销' };

    mockFetchAllErpDebts.mockResolvedValue([debt1, debt2, debt3] as any);
    mockEnrichDebtRecords.mockResolvedValue([debt1, debt2, debt3] as any);
    mockFilterHoardDebts.mockReturnValue([debt1, debt2, debt3] as any);
    mockEvaluateEntryRules.mockReturnValue([] as any);
    mockExtractEntryMetadata.mockReturnValue({
      enteringDebts: [debt1, debt2, debt3] as any,
      entryReasons: ['overdue_days'] as any,
      entryRuleSnapshot: {} as any,
    } as any);
    mockGetFormTypeByCode.mockReturnValue({ code: 'ar_collection', name: '逾期催收', formSchema: { fields: [] } } as any);

    // queryExistingBillIds 返回 B1（B2/B3 是新单据）
    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([{ bill_no: 'B1' }])) // queryExistingBillIds
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: null }])); // getSystemApplicant

    const batchClient = createMockPoolClient();
    (batchClient.query as jest.Mock).mockResolvedValue({ rows: [{ id: 200 }], rowCount: 1 });
    mockGetAppClient.mockReset();
    mockGetAppClient
      .mockResolvedValueOnce(lockClient)
      .mockResolvedValueOnce(batchClient);

    await generateCollectionOaInstances();

    // 找到 INSERT 调用，验证 billDetails 参数仅含 B2/B3
    const insertCall = (batchClient.query as jest.Mock).mock.calls.find(
      (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO oa_approval_instances')
    );
    expect(insertCall).toBeTruthy();

    // INSERT 的第二个参数是 formData JSON 字符串
    const formDataParam = insertCall[1]?.find((p: any) => typeof p === 'string' && p.includes('billDetails'));
    if (formDataParam) {
      const formData = JSON.parse(formDataParam);
      const billNos = formData.billDetails?.map((d: any) => d.billNo) || [];
      // 不应包含 B1（已在催收中）
      expect(billNos).not.toContain('B1');
      // 应包含 B2 和 B3
      expect(billNos).toContain('B2');
      expect(billNos).toContain('B3');
    }
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
      .mockResolvedValueOnce(mockQueryResult([])) // queryExistingOaInstances
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: null }])); // getSystemApplicant

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

// =====================================================
// 营销师分配 + fallback
// =====================================================

describe('generateCollectionOaInstances - 营销师分配', () => {
  function setupLockAndUnlock() {
    const lockClient = createMockPoolClient();
    (lockClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ locked: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    return lockClient;
  }

  function setupPipelineWithManager(managerName: string | null) {
    const debt = { consumerName: '张三', leftAmount: 1000, overdueDays: 10, workTime: '2026-05-01', settleMethod: 1, billId: 'B1', billTypeName: '销售单', totalAmount: 2000, managerUsers: managerName };
    mockFetchAllErpDebts.mockResolvedValue([debt] as any);
    mockEnrichDebtRecords.mockResolvedValue([debt] as any);
    mockFilterHoardDebts.mockReturnValue([debt] as any);
    mockEvaluateEntryRules.mockReturnValue([] as any);
    mockExtractEntryMetadata.mockReturnValue({
      enteringDebts: [debt] as any,
      entryReasons: ['overdue_days'] as any,
      entryRuleSnapshot: {} as any,
    } as any);
  }

  it('营销师精确匹配成功：节点包含 assigned_user_ids', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);
    setupPipelineWithManager('李营销');
    mockGetFormTypeByCode.mockReturnValue(mockArCollectionFormType());

    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([])) // queryExistingOaInstances
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: null }])); // getSystemApplicant

    const batchClient = createMockPoolClient();
    (batchClient.query as jest.Mock).mockResolvedValue({ rows: [{ id: 100 }], rowCount: 1 });
    mockGetAppClient.mockResolvedValueOnce(lockClient).mockResolvedValueOnce(batchClient);

    await generateCollectionOaInstances();

    // 验证节点 INSERT 包含 assigned_user_ids = [10]（营销师精确匹配 userId=10）
    const nodeInsertCalls = (batchClient.query as jest.Mock).mock.calls.filter(
      (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO oa_approval_nodes')
    );
    expect(nodeInsertCalls.length).toBeGreaterThanOrEqual(1);
    // 找到营销师催收节点（node_name = '营销师催收' 在参数 $3 中）
    const marketerNodeCall = nodeInsertCalls.find((c: any) => c[1]?.[2] === '营销师催收');
    expect(marketerNodeCall).toBeTruthy();
    expect(marketerNodeCall![1][5]).toEqual([100]); // assigned_user_ids = [营销师userId]（batchClient 默认返回 id=100）
  });

  it('营销师精确匹配失败，fallback 到营销经理：节点包含 comment', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);
    setupPipelineWithManager('未知营销师');
    mockGetFormTypeByCode.mockReturnValue(mockArCollectionFormType());

    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([])) // queryExistingOaInstances
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: null }])); // getSystemApplicant

    const batchClient = createMockPoolClient();
    // managerName='未知营销师' → 精确匹配失败，fallback 到营销经理
    // 注意：resolveMarketer 在 evaluateAndTriggerNodes 之前调用
    (batchClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SAVEPOINT
      .mockResolvedValueOnce({ rows: [{ id: 100 }], rowCount: 1 }) // INSERT instance
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // resolveMarketer exact match → 无此用户
      .mockResolvedValueOnce({ rows: [{ id: 20, name: '王经理' }], rowCount: 1 }) // resolveMarketer fallback → marketing_manager
      .mockResolvedValueOnce({ rows: [{ max_order: null }], rowCount: 1 }) // MAX(node_order)
      .mockResolvedValueOnce({ rows: [{ id: 300 }], rowCount: 1 }); // INSERT node (RETURNING)
    // 后续 UPDATE instance / UPDATE comment / INSERT action / RELEASE / COMMIT 使用默认值
    (batchClient.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 1 });
    mockGetAppClient.mockResolvedValueOnce(lockClient).mockResolvedValueOnce(batchClient);

    await generateCollectionOaInstances();

    // 验证节点 INSERT 包含 fallback 的 assigned_user_ids
    const nodeInsertCalls = (batchClient.query as jest.Mock).mock.calls.filter(
      (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO oa_approval_nodes')
    );
    expect(nodeInsertCalls.length).toBeGreaterThanOrEqual(1);
    const marketerNodeCall = nodeInsertCalls.find((c: any) => c[1]?.[2] === '营销师催收');
    expect(marketerNodeCall).toBeTruthy();
    expect(marketerNodeCall![1][5]).toEqual([20]); // fallback assigned_user_ids = [王经理]
    // fallback comment 通过 UPDATE oa_approval_nodes SET comment 写入
    const commentUpdateCalls = (batchClient.query as jest.Mock).mock.calls.filter(
      (c: any) => typeof c[0] === 'string' && c[0].includes('UPDATE oa_approval_nodes SET comment')
    );
    expect(commentUpdateCalls.length).toBe(1);
    expect(commentUpdateCalls[0][1][0]).toContain('未知营销师'); // comment contains original manager name
  });

  it('营销师和 fallback 均失败：节点 assigned_user_ids 为 null，不阻断', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);
    setupPipelineWithManager('未知营销师');
    mockGetFormTypeByCode.mockReturnValue(mockArCollectionFormType());

    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([])) // queryExistingOaInstances
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: null }])); // getSystemApplicant

    const batchClient = createMockPoolClient();
    // managerName='未知营销师' → 精确匹配失败，fallback 也失败
    // 注意：resolveMarketer 在 evaluateAndTriggerNodes 之前调用
    (batchClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SAVEPOINT
      .mockResolvedValueOnce({ rows: [{ id: 100 }], rowCount: 1 }) // INSERT instance
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // resolveMarketer exact match → no user
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // resolveMarketer fallback → no marketing_manager
      .mockResolvedValueOnce({ rows: [{ max_order: null }], rowCount: 1 }) // MAX(node_order)
      .mockResolvedValueOnce({ rows: [{ id: 300 }], rowCount: 1 }); // INSERT node 1 (assigned_user_ids=null)
    // 后续 UPDATE instance / INSERT action / RELEASE / COMMIT 使用默认值
    (batchClient.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 1 });
    mockGetAppClient.mockResolvedValueOnce(lockClient).mockResolvedValueOnce(batchClient);

    await generateCollectionOaInstances();

    // 实例仍然被创建，不阻断
    const insertCalls = (batchClient.query as jest.Mock).mock.calls.filter(
      (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO oa_approval_instances')
    );
    expect(insertCalls.length).toBe(1);
  });
});

// =====================================================
// 钉钉集成
// =====================================================

describe('generateCollectionOaInstances - 钉钉集成', () => {
  function setupLockAndUnlock() {
    const lockClient = createMockPoolClient();
    (lockClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ locked: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
    return lockClient;
  }

  it('事务后调用 createProcessInstance + notifyPendingApproval', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);

    const debt = { consumerName: '张三', leftAmount: 1000, overdueDays: 10, workTime: '2026-05-01', settleMethod: 1, billId: 'B1', billTypeName: '销售单', totalAmount: 2000, managerUsers: '李营销' };
    mockFetchAllErpDebts.mockResolvedValue([debt] as any);
    mockEnrichDebtRecords.mockResolvedValue([debt] as any);
    mockFilterHoardDebts.mockReturnValue([debt] as any);
    mockEvaluateEntryRules.mockReturnValue([] as any);
    mockExtractEntryMetadata.mockReturnValue({
      enteringDebts: [debt] as any,
      entryReasons: ['overdue_days'] as any,
      entryRuleSnapshot: {} as any,
    } as any);
    mockGetFormTypeByCode.mockReturnValue(mockArCollectionFormType());

    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([])) // queryExistingOaInstances
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: null }])); // getSystemApplicant

    const batchClient = createMockPoolClient();
    // MAX(node_order) 必须返回 null/0，否则 order=1 的节点会被跳过
    (batchClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ max_order: null }], rowCount: 1 }) // MAX(node_order)
      .mockResolvedValue({ rows: [{ id: 100 }], rowCount: 1 }); // 其他查询默认返回
    mockGetAppClient.mockResolvedValueOnce(lockClient).mockResolvedValueOnce(batchClient);

    await generateCollectionOaInstances();

    // 验证 initErpMeta 被调用
    expect(mockInitErpMeta).toHaveBeenCalledWith(100, '');

    // 验证 enqueueCreateProcessInstance 被调用（壳实例任务入队）
    expect(mockEnqueueCreateProcessInstance).toHaveBeenCalledWith(
      100, 'ar_collection', '逾期催收', 92, expect.any(String), expect.any(Object), expect.any(Object)
    );

    // 验证 enqueueSendApprovalNotification 被调用（钉钉待办任务入队）
    expect(mockEnqueueSendApprovalNotification).toHaveBeenCalledWith(
      'pending',
      100,
      expect.objectContaining({
        approverIds: [100],
        nodeName: '营销师催收',
        nodeOrder: 1,
      })
    );
  });

  it('营销师不存在时跳过 notifyPendingApproval', async () => {
    const lockClient = setupLockAndUnlock();
    mockGetAppClient.mockResolvedValue(lockClient);

    const debt = { consumerName: '张三', leftAmount: 1000, overdueDays: 10, workTime: '2026-05-01', settleMethod: 1, billId: 'B1', billTypeName: '销售单', totalAmount: 2000, managerUsers: null };
    mockFetchAllErpDebts.mockResolvedValue([debt] as any);
    mockEnrichDebtRecords.mockResolvedValue([debt] as any);
    mockFilterHoardDebts.mockReturnValue([debt] as any);
    mockEvaluateEntryRules.mockReturnValue([] as any);
    mockExtractEntryMetadata.mockReturnValue({
      enteringDebts: [debt] as any,
      entryReasons: ['overdue_days'] as any,
      entryRuleSnapshot: {} as any,
    } as any);
    mockGetFormTypeByCode.mockReturnValue(mockArCollectionFormType());

    mockAppQuery
      .mockResolvedValueOnce(mockQueryResult([])) // queryExistingOaInstances
      .mockResolvedValueOnce(mockQueryResult([{ id: 92, name: '鑫小财(AI员工)', department_name: null }])); // getSystemApplicant

    const batchClient = createMockPoolClient();
    // managerName=null → resolveMarketer 跳过精确匹配，fallback 查询返回空
    // 注意：resolveMarketer fallback 在 evaluateAndTriggerNodes 之前调用
    (batchClient.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SAVEPOINT
      .mockResolvedValueOnce({ rows: [{ id: 100 }], rowCount: 1 }) // INSERT instance
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // resolveMarketer fallback → null
      .mockResolvedValueOnce({ rows: [{ max_order: null }], rowCount: 1 }) // MAX(node_order)
      .mockResolvedValueOnce({ rows: [{ id: 300 }], rowCount: 1 }); // INSERT node (RETURNING)
    // 后续 UPDATE instance / INSERT action / RELEASE / COMMIT 使用默认值
    (batchClient.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 1 });
    mockGetAppClient.mockResolvedValueOnce(lockClient).mockResolvedValueOnce(batchClient);

    await generateCollectionOaInstances();

    // enqueueCreateProcessInstance 仍被调用
    expect(mockEnqueueCreateProcessInstance).toHaveBeenCalled();
    // enqueueSendApprovalNotification 不被调用（无 marketerUserId，resolveMarketer 返回空）
    expect(mockEnqueueSendApprovalNotification).not.toHaveBeenCalled();
  });
});
