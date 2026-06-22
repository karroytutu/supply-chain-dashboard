/**
 * 催收自动核销 测试
 * @module services/oa/ar-collection-auto-verify.spec
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
  fetchAllErpDebts: jest.fn(),
}));

jest.mock('./ar-collection-callback', () => ({
  verifyBills: jest.fn().mockResolvedValue('not_verified'),
}));

jest.mock('./oa-async-task.service', () => ({
  enqueueFinalizeProcessInstance: jest.fn().mockResolvedValue(undefined),
  enqueueCompleteAllPendingTodos: jest.fn().mockResolvedValue(undefined),
  enqueueSendApprovalNotification: jest.fn().mockResolvedValue(undefined),
}));

import { autoVerifySettledInstances } from './ar-collection-auto-verify';
import { fetchAllErpDebts } from '../erp-client/erp-debt.service';
import {
  enqueueFinalizeProcessInstance,
  enqueueCompleteAllPendingTodos,
} from './oa-async-task.service';
import { appQuery, getAppClient } from '../../db/appPool';

const mockFetchAllErpDebts = fetchAllErpDebts as jest.MockedFunction<typeof fetchAllErpDebts>;
const mockEnqueueFinalize = enqueueFinalizeProcessInstance as jest.MockedFunction<typeof enqueueFinalizeProcessInstance>;
const mockEnqueueComplete = enqueueCompleteAllPendingTodos as jest.MockedFunction<typeof enqueueCompleteAllPendingTodos>;
const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetAppClient = getAppClient as jest.MockedFunction<typeof getAppClient>;

// =====================================================
// 辅助函数
// =====================================================

function createMockClient() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
}

function makeInstance(id: number, instanceNo: string, bills: Array<{ billNo: string; verifyStatus?: string }>) {
  return {
    id,
    instance_no: instanceNo,
    bill_details: bills.map(b => ({
      billNo: b.billNo,
      orderNo: `ORD-${b.billNo}`,
      verifyStatus: b.verifyStatus ?? '',
    })),
  };
}

// =====================================================
// 测试用例
// =====================================================

describe('autoVerifySettledInstances', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('全部核销：所有单据已从ERP消失 → 关闭实例', async () => {
    mockFetchAllErpDebts.mockResolvedValue([]);

    mockAppQuery.mockResolvedValue({
      rows: [makeInstance(1, 'OA-001', [{ billNo: 'B1' }, { billNo: 'B2' }])],
    } as any);

    const mockClient = createMockClient();
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })        // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'pending' }] }) // FOR UPDATE 状态锁
      .mockResolvedValueOnce({ rows: [] })        // UPDATE form_data
      .mockResolvedValueOnce({ rows: [] })        // UPDATE status=approved
      .mockResolvedValueOnce({ rows: [] })        // UPDATE nodes
      .mockResolvedValueOnce({ rows: [{ node_order: 7 }] }) // SELECT auto node
      .mockResolvedValueOnce({ rows: [] })        // INSERT comment
      .mockResolvedValueOnce({ rows: [] });       // COMMIT
    mockGetAppClient.mockResolvedValue(mockClient as any);

    const result = await autoVerifySettledInstances();

    expect(result.checked).toBe(1);
    expect(result.closed).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(0);

    // 验证异步任务入队
    expect(mockEnqueueFinalize).toHaveBeenCalledWith(1, 'agree');
    expect(mockEnqueueComplete).toHaveBeenCalledWith(1);
  });

  it('部分核销：部分单据消失 → 标记状态 + 退回营销师', async () => {
    mockFetchAllErpDebts.mockResolvedValue([{ billId: 'B2' }] as any);

    mockAppQuery.mockResolvedValue({
      rows: [makeInstance(2, 'OA-002', [{ billNo: 'B1' }, { billNo: 'B2' }])],
    } as any);

    const mockClient = createMockClient();
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })        // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'pending' }] }) // FOR UPDATE 状态锁
      .mockResolvedValueOnce({ rows: [] })        // UPDATE form_data
      .mockResolvedValueOnce({ rows: [] })        // UPDATE node 1 → pending
      .mockResolvedValueOnce({ rows: [] })        // UPDATE nodes 2-6 → skipped
      .mockResolvedValueOnce({ rows: [{ node_order: 7 }] }) // SELECT auto node
      .mockResolvedValueOnce({ rows: [] })        // INSERT comment
      .mockResolvedValueOnce({ rows: [] });       // COMMIT
    mockGetAppClient.mockResolvedValue(mockClient as any);

    const result = await autoVerifySettledInstances();

    expect(result.checked).toBe(1);
    expect(result.closed).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.unchanged).toBe(0);

    // 验证 form_data 更新时 B1 被标记为已核销，B2 保持空
    const updateCall = mockClient.query.mock.calls[2]; // 第三个调用是 UPDATE form_data
    const updatedBillDetails = JSON.parse(updateCall[1][0]);
    expect(updatedBillDetails[0].verifyStatus).toBe('已核销'); // B1
    expect(updatedBillDetails[1].verifyStatus).toBe('');        // B2
  });

  it('无核销：所有单据仍在ERP中 → 跳过', async () => {
    // ERP 中两笔都在
    mockFetchAllErpDebts.mockResolvedValue([
      { billId: 'B1' }, { billId: 'B2' },
    ] as any);

    mockAppQuery.mockResolvedValue({
      rows: [makeInstance(3, 'OA-003', [{ billNo: 'B1' }, { billNo: 'B2' }])],
    } as any);

    const result = await autoVerifySettledInstances();

    expect(result.checked).toBe(1);
    expect(result.closed).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(1);

    // 不应调用任何客户端事务
    expect(mockGetAppClient).not.toHaveBeenCalled();
  });

  it('单实例失败不影响其他实例', async () => {
    mockFetchAllErpDebts.mockResolvedValue([]);

    mockAppQuery.mockResolvedValue({
      rows: [
        makeInstance(10, 'OA-010', [{ billNo: 'B10' }]),
        makeInstance(11, 'OA-011', [{ billNo: 'B11' }]),
      ],
    } as any);

    // 第一个实例的 client 抛错
    const failingClient = {
      query: jest.fn().mockRejectedValue(new Error('DB error')),
      release: jest.fn(),
    };
    // 第二个实例的 client 正常
    const okClient = createMockClient();
    okClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'pending' }] }) // FOR UPDATE
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ node_order: 7 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    mockGetAppClient
      .mockResolvedValueOnce(failingClient as any)
      .mockResolvedValueOnce(okClient as any);

    const result = await autoVerifySettledInstances();

    expect(result.checked).toBe(2);
    // 第一个失败算 unchanged，第二个成功关闭
    expect(result.closed).toBe(1);
    expect(result.unchanged).toBe(1);
  });

  it('空实例列表 → 直接返回', async () => {
    mockFetchAllErpDebts.mockResolvedValue([{ billId: 'B1' }] as any);
    mockAppQuery.mockResolvedValue({ rows: [] } as any);

    const result = await autoVerifySettledInstances();

    expect(result.checked).toBe(0);
    expect(result.closed).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(0);
  });
});
