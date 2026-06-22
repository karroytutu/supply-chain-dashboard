/**
 * 催收OA表单回调 测试
 * @module services/oa/ar-collection-callback.spec
 *
 * 测试业务逻辑回调：beforeSubmit、verifyBills、handleArCollectionAutoVerify
 * 流转路由已由引擎条件重评估机制替代，不再需要测试。
 */

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));

jest.mock('../erp-client/erp-debt.service', () => ({
  checkExistingBillIds: jest.fn(),
}));

jest.mock('./oa-async-task.service', () => ({
  enqueueSendApprovalNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./oa-workflow-utils', () => ({
  findUserIdsByRoleCodes: jest.fn().mockResolvedValue([99]),
}));

jest.mock('./mutations/shared-utils', () => ({
  sendBackToNode: jest.fn().mockResolvedValue(undefined),
}));

import { beforeSubmitArCollection, verifyBills, handleArCollectionAutoVerify } from './ar-collection-callback';
import { checkExistingBillIds } from '../erp-client/erp-debt.service';
import { appQuery, getAppClient } from '../../db/appPool';
import { enqueueSendApprovalNotification } from './oa-async-task.service';
import { sendBackToNode } from './mutations/shared-utils';
import { OaInstanceRow } from './oa.types';

const mockCheckExistingBillIds = checkExistingBillIds as jest.MockedFunction<typeof checkExistingBillIds>;
const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetAppClient = getAppClient as jest.MockedFunction<typeof getAppClient>;
const mockEnqueueNotify = enqueueSendApprovalNotification as jest.MockedFunction<typeof enqueueSendApprovalNotification>;
const mockSendBackToNode = sendBackToNode as jest.MockedFunction<typeof sendBackToNode>;

function createMockInstance(overrides: Partial<OaInstanceRow> = {}): OaInstanceRow {
  return {
    id: 1,
    instance_no: 'OA-001',
    form_type_id: 1,
    form_type_code: 'ar_collection',
    form_type_name: '逾期催收',
    title: '逾期催收 - 张三',
    status: 'pending',
    applicant_id: 1,
    applicant_name: '系统',
    applicant_dept: null,
    form_data: {},
    erp_meta: null,
    current_node_order: 1,
    submitted_at: new Date(),
    completed_at: null,
    ...overrides,
  } as OaInstanceRow;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// beforeSubmitArCollection
// =====================================================

describe('beforeSubmitArCollection', () => {
  it('返回空对象（催收单创建时无需额外初始化）', async () => {
    const result = await beforeSubmitArCollection({}, 1);
    expect(result).toEqual({});
  });

  it('formData 已有数据时仍返回空对象', async () => {
    const result = await beforeSubmitArCollection({ action: 'verify', billDetails: [] }, 1);
    expect(result).toEqual({});
  });
});

// =====================================================
// verifyBills（ERP核销校验）
// =====================================================

describe('verifyBills', () => {
  it('无账单明细时返回 not_verified', async () => {
    const instance = createMockInstance();
    const result = await verifyBills(instance, { billDetails: [] });
    expect(result).toBe('not_verified');
  });

  it('全部核销：返回 all_verified，更新 billDetails', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set()); // ERP 中无记录 = 全部核销消失
    mockAppQuery.mockResolvedValue({ rows: [] } as any); // UPDATE form_data

    const billDetails = [
      { billNo: 'B1', verifyStatus: '' },
      { billNo: 'B2', verifyStatus: '' },
    ];
    const instance = createMockInstance();
    const result = await verifyBills(instance, { billDetails });

    expect(result).toBe('all_verified');
    expect(billDetails[0].verifyStatus).toBe('已核销');
    expect(billDetails[1].verifyStatus).toBe('已核销');
    expect(mockAppQuery).toHaveBeenCalled(); // form_data 被更新
  });

  it('部分核销：返回 partial_verified，仅标记消失的单据', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set(['B1'])); // B1 仍存在 = 未核销
    mockAppQuery.mockResolvedValue({ rows: [] } as any);

    const billDetails = [
      { billNo: 'B1', verifyStatus: '' },
      { billNo: 'B2', verifyStatus: '' },
    ];
    const instance = createMockInstance();
    const result = await verifyBills(instance, { billDetails });

    expect(result).toBe('partial_verified');
    expect(billDetails[0].verifyStatus).toBe(''); // B1 仍存在
    expect(billDetails[1].verifyStatus).toBe('已核销'); // B2 已消失
  });

  it('无核销：返回 not_verified，不修改 verifyStatus', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set(['B1', 'B2'])); // 全部仍存在
    mockAppQuery.mockResolvedValue({ rows: [] } as any);

    const billDetails = [
      { billNo: 'B1', verifyStatus: '' },
      { billNo: 'B2', verifyStatus: '' },
    ];
    const instance = createMockInstance();
    const result = await verifyBills(instance, { billDetails });

    expect(result).toBe('not_verified');
    expect(billDetails[0].verifyStatus).toBe('');
    expect(billDetails[1].verifyStatus).toBe('');
  });

  it('无核销时不应执行数据库写入', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set(['B1', 'B2'])); // 全部仍存在
    mockAppQuery.mockResolvedValue({ rows: [] } as any);

    const billDetails = [
      { billNo: 'B1', verifyStatus: '' },
      { billNo: 'B2', verifyStatus: '' },
    ];
    const instance = createMockInstance();
    await verifyBills(instance, { billDetails });

    // 无核销变化时不应执行 UPDATE
    const updateCalls = mockAppQuery.mock.calls.filter(
      call => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE')
    );
    expect(updateCalls.length).toBe(0);
  });
});

// =====================================================
// handleArCollectionAutoVerify（auto 环节核销回调）
// =====================================================

describe('handleArCollectionAutoVerify', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  beforeEach(() => {
    mockGetAppClient.mockResolvedValue(mockClient as any);
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it('全部核销：不操作节点，催收单由框架自动结案', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set());
    mockAppQuery.mockResolvedValue({ rows: [] } as any);

    const billDetails = [{ billNo: 'B1', verifyStatus: '' }];
    const instance = createMockInstance();
    await handleArCollectionAutoVerify(instance, { billDetails });

    // 全部核销时不应开启事务操作节点
    expect(mockGetAppClient).not.toHaveBeenCalled();
    expect(mockEnqueueNotify).not.toHaveBeenCalled();
  });

  it('部分核销：退回营销师继续催收，发送通知', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set(['B1'])); // B1 exists, B2 disappeared
    mockAppQuery
      .mockResolvedValueOnce({ rows: [] } as any) // verifyBills UPDATE form_data
      .mockResolvedValueOnce({ rows: [{ assigned_user_ids: [42] }] } as any); // SELECT for notification

    // mockClient.query 链：BEGIN → SELECT auto node → sendBackToNode(mocked) → COMMIT
    mockClient.query
      .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 700, node_order: 7, node_type: 'auto', round: 1 }] } as any) // SELECT auto node
      .mockResolvedValueOnce({ rows: [] } as any) // COMMIT
      .mockResolvedValueOnce({ rows: [] } as any); // ROLLBACK (safety)

    const billDetails = [
      { billNo: 'B1', verifyStatus: '' },
      { billNo: 'B2', verifyStatus: '' },
    ];
    const instance = createMockInstance();
    await handleArCollectionAutoVerify(instance, { billDetails });

    expect(mockGetAppClient).toHaveBeenCalled();
    expect(mockClient.release).toHaveBeenCalled();
    // sendBackToNode 被调用：auto节点(700, order=7) → 退回到营销师(order=1)
    expect(mockSendBackToNode).toHaveBeenCalledWith(
      mockClient, instance.id,
      700, 7,  // autoNode.id, autoNode.node_order
      1,       // targetNodeOrder (营销师)
      expect.any(String) // commentText
    );
    expect(mockEnqueueNotify).toHaveBeenCalledWith('pending', instance.id, {
      approverIds: [42],
      nodeName: '营销师催收',
      nodeOrder: 1,
    });
  });

  it('未核销：退回营销师继续催收', async () => {
    mockCheckExistingBillIds.mockResolvedValue(new Set(['B1', 'B2'])); // both exist = none disappeared
    mockAppQuery
      .mockResolvedValueOnce({ rows: [{ assigned_user_ids: [42] }] } as any); // SELECT for notification

    mockClient.query
      .mockResolvedValueOnce({ rows: [] } as any) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 700, node_order: 7, node_type: 'auto', round: 1 }] } as any) // SELECT auto node
      .mockResolvedValueOnce({ rows: [] } as any) // COMMIT
      .mockResolvedValueOnce({ rows: [] } as any); // ROLLBACK (safety)

    const billDetails = [
      { billNo: 'B1', verifyStatus: '' },
      { billNo: 'B2', verifyStatus: '' },
    ];
    const instance = createMockInstance();
    await handleArCollectionAutoVerify(instance, { billDetails });

    expect(mockGetAppClient).toHaveBeenCalled();
    expect(mockSendBackToNode).toHaveBeenCalled();
    expect(mockEnqueueNotify).toHaveBeenCalled();
  });
});
