/**
 * OA 同意操作单元测试
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../oa-utils', () => ({
  isCurrentApprover: jest.fn(),
  getCurrentApproverNode: jest.fn().mockResolvedValue({ id: 10, node_order: 1, node_type: 'role' }),
  validateInputData: jest.fn().mockReturnValue([]),
}));

jest.mock('../form-types', () => ({
  getFormTypeByCode: jest.fn(),
}));

jest.mock('./shared-utils', () => ({
  transaction: jest.fn(),
  mergeFormData: jest.fn((a: any, b: any) => ({ ...a, ...b })),
}));

jest.mock('./auto-node-operations', () => ({
  executeAutoNodeCallback: jest.fn(),
  sendApprovalNotifications: jest.fn(),
  triggerCcIfApplicable: jest.fn(),
}));

jest.mock('../oa-process-centre', () => ({
  completeApprovalTodo: jest.fn().mockResolvedValue(undefined),
  finalizeProcessInstance: jest.fn().mockResolvedValue(undefined),
}));

import { isCurrentApprover, getCurrentApproverNode } from '../oa-utils';
import { getFormTypeByCode } from '../form-types';
import { transaction, mergeFormData } from './shared-utils';
import { approveApproval } from './approve-approval';

const mockIsCurrentApprover = isCurrentApprover as jest.MockedFunction<typeof isCurrentApprover>;
const mockGetCurrentNode = getCurrentApproverNode as jest.MockedFunction<typeof getCurrentApproverNode>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;
const mockMergeFormData = mergeFormData as jest.MockedFunction<typeof mergeFormData>;

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  // 恢复默认 mock 行为
  mockGetCurrentNode.mockResolvedValue({ id: 10, node_order: 1, node_type: 'role' } as any);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('approveApproval', () => {
  it('非当前审批人时抛出异常', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(false);

    await expect(approveApproval(1, 5, '张三')).rejects.toThrow('您不是当前审批人');
  });

  it('事务执行成功返回 approved', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);

    // Mock transaction to simulate successful execution
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      // Simulate the transaction callback with a mock client
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: {}, status: 'pending' }] }) // SELECT instance0
          .mockResolvedValueOnce({ rows: [{ code: 'other_payment' }] }) // SELECT form type code
          // getCurrentApproverNode is MOCKED, does not consume client.query
          .mockResolvedValueOnce({ rows: [] }) // UPDATE node approved
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: {}, status: 'pending' }] }) // re-fetch instance
          .mockResolvedValueOnce({ rows: [] }) // next node (empty = last node)
          .mockResolvedValueOnce({ rows: [] }) // failedAutoCheck (empty = no failed auto nodes)
          .mockResolvedValueOnce({ rows: [] }) // UPDATE instance status
          .mockResolvedValueOnce({ rows: [] }) // INSERT action
          .mockResolvedValueOnce({ rows: [] }), // INSERT comment - 统一评论模型新增
        };
      return fn(mockClient);
    });

    (getFormTypeByCode as jest.Mock).mockReturnValue({
      code: 'other_payment',
      name: '其他付款',
      formSchema: { fields: [] },
    });

    const result = await approveApproval(1, 5, '张三', '同意');
    expect(result.status).toBe('approved');
  });

  it('存在下一节点时更新 current_node_order', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: {}, status: 'pending' }] })
          .mockResolvedValueOnce({ rows: [{ code: 'test_form' }] })
          .mockResolvedValueOnce({ rows: [{ id: 10, node_order: 1, node_type: 'role' }] })
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: {}, status: 'pending' }] })
          .mockResolvedValueOnce({ rows: [{ id: 11, node_order: 2, node_type: 'role', status: 'pending' }] }) // next node exists
          .mockResolvedValueOnce({ rows: [] }), // UPDATE
      };
      return fn(mockClient);
    });

    (getFormTypeByCode as jest.Mock).mockReturnValue({
      code: 'test_form', name: '测试表单', formSchema: { fields: [] },
    });

    const result = await approveApproval(1, 5, '张三');
    expect(result.status).toBe('approved');
  });

  it('下一节点为 auto 类型时返回 processing', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: {}, status: 'pending' }] })
          .mockResolvedValueOnce({ rows: [{ code: 'auto_form' }] })
          .mockResolvedValueOnce({ rows: [{ id: 10, node_order: 1, node_type: 'role' }] })
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: {}, status: 'pending' }] })
          .mockResolvedValueOnce({ rows: [{ id: 11, node_order: 2, node_type: 'auto', status: 'pending' }] }) // auto node
          .mockResolvedValueOnce({ rows: [] }), // UPDATE erp_meta
      };
      return fn(mockClient);
    });

    (getFormTypeByCode as jest.Mock).mockReturnValue({
      code: 'auto_form', name: '自动表单', formSchema: { fields: [] }, onApproved: jest.fn(),
    });

    const result = await approveApproval(1, 5, '张三');
    expect(result.status).toBe('processing');
  });

  it('role 节点 + inputData → 合并到 form_data（非 data_input 节点通用支持）', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: { action: null }, status: 'pending' }] }) // SELECT instance0 FOR UPDATE
          .mockResolvedValueOnce({ rows: [{ code: 'ar_collection' }] }) // SELECT form type code
          // getCurrentApproverNode is MOCKED, does not consume client.query
          .mockResolvedValueOnce({ rows: [] }) // UPDATE form_data (inputData merge)
          .mockResolvedValueOnce({ rows: [] }) // UPDATE node approved
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: { action: 'verify' }, status: 'pending' }] }) // re-fetch instance
          .mockResolvedValueOnce({ rows: [] }) // next node (empty = last node)
          .mockResolvedValueOnce({ rows: [] }) // failedAutoCheck (empty = no failed auto nodes)
          .mockResolvedValueOnce({ rows: [] }) // UPDATE instance status
          .mockResolvedValueOnce({ rows: [] }) // INSERT action
          .mockResolvedValueOnce({ rows: [] }), // INSERT comment
      };
      return fn(mockClient);
    });

    (getFormTypeByCode as jest.Mock).mockReturnValue({
      code: 'ar_collection', name: '催收', formSchema: { fields: [] },
    });

    const inputData = { action: 'verify', verifyRemark: '已核销' };
    const result = await approveApproval(1, 5, '张三', '完成', inputData);
    expect(result.status).toBe('approved');

    // 验证 mergeFormData 被调用
    expect(mockMergeFormData).toHaveBeenCalledWith(
      { action: null },
      { action: 'verify', verifyRemark: '已核销' }
    );
  });

  it('role 节点 + 无 inputData → 不合并 form_data', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: {}, status: 'pending' }] })
          .mockResolvedValueOnce({ rows: [{ code: 'other_payment' }] })
          // 无 inputData → 不调用 UPDATE form_data
          .mockResolvedValueOnce({ rows: [] }) // UPDATE node approved
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: {}, status: 'pending' }] })
          .mockResolvedValueOnce({ rows: [] }) // next node
          .mockResolvedValueOnce({ rows: [] }) // failedAutoCheck (empty = no failed auto nodes)
          .mockResolvedValueOnce({ rows: [] }) // UPDATE instance
          .mockResolvedValueOnce({ rows: [] }) // INSERT action
          .mockResolvedValueOnce({ rows: [] }),
      };
      return fn(mockClient);
    });

    (getFormTypeByCode as jest.Mock).mockReturnValue({
      code: 'other_payment', name: '其他付款', formSchema: { fields: [] },
    });

    const result = await approveApproval(1, 5, '张三');
    expect(result.status).toBe('approved');
    // mergeFormData 不应被调用（无 inputData）
    expect(mockMergeFormData).not.toHaveBeenCalled();
  });

  it('实例处于 processing 状态时拒绝审批（防止 auto 节点处理期间重复操作）', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: {}, status: 'processing' }] }),
      };
      return fn(mockClient);
    });

    await expect(approveApproval(1, 5, '张三')).rejects.toThrow('审批正在自动处理中，请勿重复操作');
  });

  it('无后续节点但存在 failed auto 节点时返回 erp_failed', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: {}, status: 'pending' }] }) // SELECT instance0
          .mockResolvedValueOnce({ rows: [{ code: 'other_payment' }] }) // SELECT form type code
          .mockResolvedValueOnce({ rows: [] }) // UPDATE node approved
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: {}, status: 'pending' }] }) // re-fetch instance
          .mockResolvedValueOnce({ rows: [] }) // next node (empty = last node)
          .mockResolvedValueOnce({ rows: [{ id: 99, node_name: '自动处理', comment: 'ERP执行失败' }] }) // failedAutoCheck - 有失败节点
          .mockResolvedValueOnce({ rows: [] }) // UPDATE instance → erp_failed
          .mockResolvedValueOnce({ rows: [] }) // INSERT action
          .mockResolvedValueOnce({ rows: [] }), // INSERT comment
      };
      return fn(mockClient);
    });

    (getFormTypeByCode as jest.Mock).mockReturnValue({
      code: 'other_payment',
      name: '其他付款',
      formSchema: { fields: [] },
      onApproved: jest.fn(),
    });

    const result = await approveApproval(1, 5, '张三');
    expect(result.status).toBe('erp_failed');
  });
});
