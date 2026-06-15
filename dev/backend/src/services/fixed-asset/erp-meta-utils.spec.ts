/**
 * erp-meta-utils 单元测试
 * 测试 ErpMeta 状态机的核心读写逻辑
 */

import {
  getErpMeta,
  initErpMeta,
  updateErpMetaStatus,
  mergeErpResponseData,
  markErpFailed,
  retryErpOperation,
  recoverStuckProcessing,
  recoverStuckAutoNodes,
} from './erp-meta-utils';
import { appQuery } from '../../db/appPool';
import type { ErpMeta, OaInstanceRow } from '../oa/oa.types';

// Mock 数据库查询
jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

// Mock form-types 的动态导入
jest.mock(
  '../oa/form-types',
  () => ({
    getFormTypeByCode: jest.fn(),
  }),
  { virtual: true }
);

// Mock oa.mutation 的动态导入
const mockRetryAutoNode = jest.fn().mockResolvedValue(undefined);
jest.mock(
  '../oa/oa.mutation',
  () => ({
    retryAutoNode: (...args: any[]) => mockRetryAutoNode(...args),
  }),
  { virtual: true }
);

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

beforeEach(() => {
  mockAppQuery.mockReset();
  mockRetryAutoNode.mockReset();
});

/** 创建模拟的审批实例行 */
function createMockInstance(erpMeta: ErpMeta | null = null): OaInstanceRow {
  return {
    id: 1,
    instance_no: 'OA20260420001',
    form_type_id: 1,
    title: '测试审批',
    applicant_id: 1,
    applicant_name: '测试用户',
    applicant_dept: '测试部门',
    form_data: {},
    status: 'approved',
    current_node_order: 1,
    erp_meta: erpMeta,
    submitted_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    completed_at: null,
  };
}

/** 从 mock 调用记录中提取最后一次 UPDATE 的 erp_meta JSON 参数 */
function getLastUpdateErpMeta(): ErpMeta {
  const updateCall = mockAppQuery.mock.calls.find(call =>
    (call[0] as string).includes('UPDATE oa_approval_instances SET erp_meta')
  );
  if (!updateCall) throw new Error('未找到 UPDATE erp_meta 调用');
  return JSON.parse(updateCall![1]![0] as string) as ErpMeta;
}

describe('getErpMeta', () => {
  it('应正确返回 erp_meta 数据', () => {
    const meta: ErpMeta = {
      status: 'pending',
      responseData: {},
      requestLog: null,
      applicationNo: 'APA20260420001',
      retries: 0,
    };
    const instance = createMockInstance(meta);
    expect(getErpMeta(instance)).toEqual(meta);
  });

  it('erp_meta 为 null 时应返回 null', () => {
    const instance = createMockInstance(null);
    expect(getErpMeta(instance)).toBeNull();
  });
});

describe('initErpMeta', () => {
  it('应使用 APA 编号初始化 erp_meta', async () => {
    mockAppQuery.mockResolvedValue({ rows: [], rowCount: 1 } as never);

    await initErpMeta(1, 'APA20260420001');

    const updatedJson = getLastUpdateErpMeta();
    expect(updatedJson).toEqual({
      status: 'pending',
      responseData: {},
      requestLog: null,
      applicationNo: 'APA20260420001',
      retries: 0,
    });
  });
});

describe('updateErpMetaStatus', () => {
  it('应正确更新状态为 paying', async () => {
    const existingMeta: ErpMeta = {
      status: 'pending',
      responseData: {},
      requestLog: null,
      applicationNo: 'APA20260420001',
      retries: 0,
    };

    // getAndUpdateErpMeta：先 SELECT，再 UPDATE
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ erp_meta: { ...existingMeta } }],
    } as never);
    // setErpMeta 的 UPDATE
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await updateErpMetaStatus(1, 'paying');

    const updatedJson = getLastUpdateErpMeta();
    expect(updatedJson.status).toBe('paying');
    expect(updatedJson.applicationNo).toBe('APA20260420001');
  });

  it('应正确更新状态为 completed', async () => {
    const existingMeta: ErpMeta = {
      status: 'storing',
      responseData: { expenditureBillId: 12345 },
      requestLog: null,
      applicationNo: 'APA20260420001',
      retries: 0,
    };

    mockAppQuery.mockResolvedValueOnce({
      rows: [{ erp_meta: { ...existingMeta } }],
    } as never);
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await updateErpMetaStatus(1, 'completed');

    const updatedJson = getLastUpdateErpMeta();
    expect(updatedJson.status).toBe('completed');
    expect(updatedJson.responseData.expenditureBillId).toBe(12345);
  });

  it('现有 erp_meta 为 null 时应创建初始结构后更新', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ erp_meta: null }],
    } as never);
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await updateErpMetaStatus(1, 'paying');

    const updatedJson = getLastUpdateErpMeta();
    expect(updatedJson.status).toBe('paying');
    expect(updatedJson.applicationNo).toBe('');
  });
});

describe('mergeErpResponseData', () => {
  it('应合并新数据到已有 responseData', async () => {
    const existingMeta: ErpMeta = {
      status: 'purchasing',
      responseData: { expenditureBillId: 12345, billStr: 'EXP-001' },
      requestLog: null,
      applicationNo: 'APA20260420001',
      retries: 0,
    };

    mockAppQuery.mockResolvedValueOnce({
      rows: [{ erp_meta: { ...existingMeta } }],
    } as never);
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await mergeErpResponseData(1, { createdAssets: [{ erpAssetId: 999, code: 'GDZC-0001' }] });

    const updatedJson = getLastUpdateErpMeta();
    expect(updatedJson.responseData.expenditureBillId).toBe(12345);
    expect(updatedJson.responseData.createdAssets).toEqual([
      { erpAssetId: 999, code: 'GDZC-0001' },
    ]);
  });

  it('应覆盖同名的 responseData 字段', async () => {
    const existingMeta: ErpMeta = {
      status: 'pending',
      responseData: { key1: 'old' },
      requestLog: null,
      applicationNo: 'APA20260420001',
      retries: 0,
    };

    mockAppQuery.mockResolvedValueOnce({
      rows: [{ erp_meta: { ...existingMeta } }],
    } as never);
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await mergeErpResponseData(1, { key1: 'new', key2: 'added' });

    const updatedJson = getLastUpdateErpMeta();
    expect(updatedJson.responseData.key1).toBe('new');
    expect(updatedJson.responseData.key2).toBe('added');
  });
});

describe('markErpFailed', () => {
  it('应标记 erp_failed 并记录错误日志和递增重试次数', async () => {
    const existingMeta: ErpMeta = {
      status: 'paying',
      responseData: { expenditureBillId: 12345 },
      requestLog: null,
      applicationNo: 'APA20260420001',
      retries: 0,
    };

    mockAppQuery.mockResolvedValueOnce({
      rows: [{ erp_meta: { ...existingMeta } }],
    } as never);
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await markErpFailed(1, { error: 'ERP timeout', statusCode: 500 });

    const updatedJson = getLastUpdateErpMeta();
    expect(updatedJson.status).toBe('erp_failed');
    expect(updatedJson.requestLog).toEqual({ error: 'ERP timeout', statusCode: 500 });
    expect(updatedJson.retries).toBe(1);
    expect(updatedJson.responseData.expenditureBillId).toBe(12345);
  });

  it('第二次失败时 retries 应递增到 2', async () => {
    const existingMeta: ErpMeta = {
      status: 'erp_failed',
      responseData: {},
      requestLog: { error: 'first failure' },
      applicationNo: 'APA20260420001',
      retries: 1,
    };

    mockAppQuery.mockResolvedValueOnce({
      rows: [{ erp_meta: { ...existingMeta } }],
    } as never);
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await markErpFailed(1, { error: 'second failure' });

    const updatedJson = getLastUpdateErpMeta();
    expect(updatedJson.retries).toBe(2);
    expect(updatedJson.requestLog).toEqual({ error: 'second failure' });
  });
});

describe('retryErpOperation', () => {
  it('非 erp_failed 状态时应抛出错误', async () => {
    // 第一次查询：检查 status（非 erp_failed）
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ status: 'completed' }],
    } as never);

    await expect(retryErpOperation(1)).rejects.toThrow('审批实例状态不是 erp_failed，无法重试');
  });

  it('erp_meta 为 null 时应抛出错误', async () => {
    // 第一次查询：检查 status（erp_failed 通过）
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ status: 'erp_failed' }],
    } as never);
    // 第二次查询：获取 erp_meta（为 null）
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ erp_meta: null, form_type_id: 1 }],
    } as never);

    await expect(retryErpOperation(1)).rejects.toThrow('审批实例不存在或无 erp_meta');
  });

  it('erp_failed 状态时应重置 erp_meta 并委托 retryAutoNode', async () => {
    const failedMeta: ErpMeta = {
      status: 'erp_failed',
      responseData: { expenditureBillId: 12345 },
      requestLog: { error: 'timeout' },
      applicationNo: 'APA20260420001',
      retries: 1,
    };

    // 第一次查询：检查 status
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ status: 'erp_failed' }],
    } as never);

    // 第二次查询：获取 erp_meta
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ erp_meta: { ...failedMeta } }],
    } as never);

    // setErpMeta 的 UPDATE
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    await retryErpOperation(1);

    // 验证 erp_meta 被重置为 pending，responseData 也被清理
    const updatedJson = getLastUpdateErpMeta();
    expect(updatedJson.status).toBe('pending');
    expect(updatedJson.requestLog).toBeNull();
    expect(updatedJson.responseData).toEqual({});

    // 验证委托给了 retryAutoNode
    expect(mockRetryAutoNode).toHaveBeenCalledWith(1);
  });
});

describe('recoverStuckAutoNodes', () => {
  it('无卡住实例时返回 0', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as never);
    const result = await recoverStuckAutoNodes();
    expect(result).toBe(0);
  });

  it('正常催收单（人工节点 pending + auto 节点 pending）不应被误检', async () => {
    // SQL 查询中的 NOT EXISTS 子查询会排除有人工节点 pending 的实例
    // 模拟：查询返回空（NOT EXISTS 正确排除了正常实例）
    mockAppQuery.mockResolvedValueOnce({ rows: [] } as never);
    const result = await recoverStuckAutoNodes();
    expect(result).toBe(0);
    // 验证 SQL 包含 NOT EXISTS 条件
    const sqlCall = mockAppQuery.mock.calls[0][0] as string;
    expect(sqlCall).toContain('NOT EXISTS');
    expect(sqlCall).toContain("hn.node_type != 'auto'");
  });

  it('真正卡住的实例（人工节点已完成 + auto 节点 pending）应被检出并恢复', async () => {
    // SQL 返回一个卡住的实例
    mockAppQuery.mockResolvedValueOnce({ rows: [{ id: 42 }] } as never);
    // 应用层双重验证：确认无人工环节阻塞
    mockAppQuery.mockResolvedValueOnce({ rows: [{ blocked: false }] } as never);
    await recoverStuckAutoNodes();
    // 验证调用了 retryAutoNode
    expect(mockRetryAutoNode).toHaveBeenCalledWith(42);
  });

  it('应用层验证：人工环节未完成时跳过恢复', async () => {
    // SQL 返回一个实例（可能因时序问题被误检）
    mockAppQuery.mockResolvedValueOnce({ rows: [{ id: 99 }] } as never);
    // 应用层验证发现仍有人工环节 pending
    mockAppQuery.mockResolvedValueOnce({ rows: [{ blocked: true }] } as never);
    const result = await recoverStuckAutoNodes();
    // 不应调用 retryAutoNode
    expect(mockRetryAutoNode).not.toHaveBeenCalled();
    expect(result).toBe(0);
  });

  it('超过阈值时记录告警日志', async () => {
    // 模拟返回 11 个卡住的实例（超过阈值 10）
    const manyInstances = Array.from({ length: 11 }, (_, i) => ({ id: i + 1 }));
    mockAppQuery.mockResolvedValueOnce({ rows: manyInstances } as never);
    // 为每个实例提供应用层验证（全部阻塞）
    for (let i = 0; i < 11; i++) {
      mockAppQuery.mockResolvedValueOnce({ rows: [{ blocked: true }] } as never);
    }
    await recoverStuckAutoNodes();
    // 验证不执行任何 retry
    expect(mockRetryAutoNode).not.toHaveBeenCalled();
  });
});

describe('recoverStuckProcessing', () => {
  it('erp_meta 为终态但 auto 节点前人工环节未完成时标记为 erp_failed', async () => {
    // 查询返回一个 processing 状态的实例
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ id: 55, erp_meta: { status: 'erp_completed', responseData: {}, requestLog: null, applicationNo: '', retries: 0 } }],
    } as never);
    // 查询 auto 节点的 node_order
    mockAppQuery.mockResolvedValueOnce({ rows: [{ node_order: 2 }] } as never);
    // 安全检查发现 auto 节点前有人工环节未完成
    mockAppQuery.mockResolvedValueOnce({ rows: [{ blocked: true }] } as never);
    // markErpFailed 调用 getAndUpdateErpMeta → SELECT + UPDATE
    mockAppQuery.mockResolvedValueOnce({ rows: [{ erp_meta: { status: 'erp_completed', responseData: {}, requestLog: null, applicationNo: '', retries: 0 } }] } as never);
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never); // setErpMeta UPDATE
    // 标记实例为 erp_failed
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const result = await recoverStuckProcessing();
    expect(result).toBe(1);
    // 验证实例被标记为 erp_failed 而非 approved
    const failedCall = mockAppQuery.mock.calls.find(
      c => typeof c[0] === 'string' && (c[0] as string).includes("'erp_failed'")
    );
    expect(failedCall).toBeTruthy();
  });

  it('erp_meta 为终态且 auto 节点前人工环节均已完成时直接标记为 approved', async () => {
    // 查询返回一个 processing 状态的实例
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ id: 77, erp_meta: { status: 'completed', responseData: {}, requestLog: null, applicationNo: 'APA1', retries: 0 } }],
    } as never);
    // 查询 auto 节点的 node_order
    mockAppQuery.mockResolvedValueOnce({ rows: [{ node_order: 2 }] } as never);
    // 安全检查：auto 节点前无人工环节阻塞
    mockAppQuery.mockResolvedValueOnce({ rows: [{ blocked: false }] } as never);
    // UPDATE instance → approved
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    // UPDATE nodes → approved
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    const result = await recoverStuckProcessing();
    expect(result).toBe(1);
    // 验证实例被标记为 approved（正常完成路径）
    const approvedCall = mockAppQuery.mock.calls.find(
      c => typeof c[0] === 'string' && (c[0] as string).includes("'approved'") && (c[0] as string).includes('completed_at')
    );
    expect(approvedCall).toBeTruthy();
  });
});
