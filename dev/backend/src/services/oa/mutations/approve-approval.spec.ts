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
import { transaction } from './shared-utils';
import { approveApproval } from './approve-approval';

const mockIsCurrentApprover = isCurrentApprover as jest.MockedFunction<typeof isCurrentApprover>;
const mockGetCurrentNode = getCurrentApproverNode as jest.MockedFunction<typeof getCurrentApproverNode>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;

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
});
