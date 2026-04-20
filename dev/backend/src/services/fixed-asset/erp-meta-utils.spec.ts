/**
 * erp-meta-utils 单元测试
 * 测试 ErpMeta 状态机的核心读写逻辑
 */

import { getErpMeta, initErpMeta, updateErpMetaStatus, mergeErpResponseData, markErpFailed, retryErpOperation } from './erp-meta-utils';
import { appQuery } from '../../db/appPool';
import type { ErpMeta, OaApprovalInstanceRow } from '../oa-approval/oa-approval.types';

// Mock 数据库查询
jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

// Mock form-types 的动态导入
jest.mock('../oa-approval/form-types', () => ({
  getFormTypeByCode: jest.fn(),
}), { virtual: true });

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;

beforeEach(() => {
  mockAppQuery.mockReset();
});

/** 创建模拟的审批实例行 */
function createMockInstance(erpMeta: ErpMeta | null = null): OaApprovalInstanceRow {
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
    urgency: 'normal',
    erp_meta: erpMeta,
    submitted_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    completed_at: null,
  };
}

/** 从 mock 调用记录中提取最后一次 UPDATE 的 erp_meta JSON 参数 */
function getLastUpdateErpMeta(): ErpMeta {
  const updateCall = mockAppQuery.mock.calls.find(
    (call) => (call[0] as string).includes('UPDATE oa_approval_instances SET erp_meta')
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
    expect(updatedJson.responseData.createdAssets).toEqual([{ erpAssetId: 999, code: 'GDZC-0001' }]);
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
    const existingMeta: ErpMeta = {
      status: 'completed',
      responseData: {},
      requestLog: null,
      applicationNo: 'APA20260420001',
      retries: 0,
    };

    mockAppQuery.mockResolvedValueOnce({
      rows: [{ erp_meta: existingMeta, form_type_id: 1 }],
    } as never);

    await expect(retryErpOperation(1)).rejects.toThrow('审批实例不存在或ERP状态不是 erp_failed');
  });

  it('erp_meta 为 null 时应抛出错误', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ erp_meta: null, form_type_id: 1 }],
    } as never);

    await expect(retryErpOperation(1)).rejects.toThrow('审批实例不存在或ERP状态不是 erp_failed');
  });

  it('erp_failed 状态时应重置为 pending 并触发回调', async () => {
    const failedMeta: ErpMeta = {
      status: 'erp_failed',
      responseData: { expenditureBillId: 12345 },
      requestLog: { error: 'timeout' },
      applicationNo: 'APA20260420001',
      retries: 1,
    };

    // 第一次查询：获取 erp_meta 和 form_type_id
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ erp_meta: { ...failedMeta }, form_type_id: 1 }],
    } as never);

    // setErpMeta 的 UPDATE
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

    // 第三次查询：获取 form_type code
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ code: 'asset_purchase' }],
    } as never);

    // 第四次查询：获取实例详情（用于回调）
    const mockInstance = createMockInstance({ ...failedMeta, status: 'pending' });
    mockAppQuery.mockResolvedValueOnce({
      rows: [mockInstance],
    } as never);

    await retryErpOperation(1);

    const updatedJson = getLastUpdateErpMeta();
    expect(updatedJson.status).toBe('pending');
    expect(updatedJson.requestLog).toBeNull();
    expect(updatedJson.retries).toBe(1);
    expect(updatedJson.responseData.expenditureBillId).toBe(12345);
  });
});
