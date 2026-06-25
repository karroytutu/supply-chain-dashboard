/**
 * OA 拒绝 + 转交操作单元测试
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../oa-utils', () => ({
  isCurrentApprover: jest.fn(),
  getCurrentApproverNode: jest.fn().mockResolvedValue({ id: 10, node_order: 1, node_type: 'role' }),
}));

jest.mock('../form-types', () => ({
  getFormTypeByCode: jest.fn(),
}));

jest.mock('../oa-notify', () => ({
  notifyRejected: jest.fn().mockResolvedValue(undefined),
  notifyTransferred: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../oa-process-centre', () => ({
  completeApprovalTodo: jest.fn().mockResolvedValue(undefined),
  completeAllPendingTodos: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./shared-utils', () => ({
  transaction: jest.fn(),
  getInstanceNotifyData: jest.fn().mockResolvedValue(null),
}));

import { appQuery } from '../../../db/appPool';
import { isCurrentApprover, getCurrentApproverNode } from '../oa-utils';
import { transaction } from './shared-utils';
import { rejectApproval, transferApproval } from './reject-transfer';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockIsCurrentApprover = isCurrentApprover as jest.MockedFunction<typeof isCurrentApprover>;
const mockGetCurrentNode = getCurrentApproverNode as jest.MockedFunction<typeof getCurrentApproverNode>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;

/** 为加锁后的 transaction 创建 mock client，默认返回 pending 实例行 */
function createMockClient(instanceOverrides: any = {}) {
  return {
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('oa_approval_instances') && sql.includes('FOR UPDATE')) {
        return Promise.resolve({
          rows: [
            {
              id: 1,
              status: 'pending',
              applicant_id: 5,
              current_node_order: 1,
              ...instanceOverrides,
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  // 恢复默认 mock 行为
  mockGetCurrentNode.mockResolvedValue({ id: 10, node_order: 1, node_type: 'role' } as any);
});

afterEach(() => {
  jest.useRealTimers();
});

// ==================== rejectApproval ====================

describe('rejectApproval', () => {
  it('非当前审批人时抛出异常', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(false);

    await expect(rejectApproval(1, 5, '张三', '不同意')).rejects.toThrow('您不是当前审批人');
  });

  it('成功拒绝审批', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // advisory lock
          .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] }) // SELECT instance FOR UPDATE
          .mockResolvedValueOnce({ rows: [] }) // UPDATE node rejected
          .mockResolvedValueOnce({ rows: [] }) // UPDATE instance rejected
          .mockResolvedValueOnce({ rows: [] }) // CANCEL pending nodes
          .mockResolvedValueOnce({ rows: [] }) // INSERT action (reject)
          .mockResolvedValueOnce({ rows: [{ id: 1, form_type_id: 1, form_data: {}, status: 'rejected', applicant_id: 5, applicant_name: 'A' }] }) // SELECT instance
          .mockResolvedValueOnce({ rows: [{ code: 'test_form' }] }), // SELECT form type code
      };
      return fn(mockClient);
    });

    await rejectApproval(1, 5, '张三', '不符合要求');
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('未找到待审批节点时抛出异常', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);
    mockGetCurrentNode.mockResolvedValueOnce(null as any);

    mockTransaction.mockImplementationOnce(async (fn: any) => fn(createMockClient()));

    await expect(rejectApproval(1, 5, '张三', '拒绝')).rejects.toThrow('未找到待审批节点');
  });
});

// ==================== transferApproval ====================

describe('transferApproval', () => {
  it('非当前审批人时抛出异常', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(false);

    await expect(transferApproval(1, 5, '张三', 10)).rejects.toThrow('您不是当前审批人');
  });

  it('转交目标用户不存在时抛出异常', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await expect(transferApproval(1, 5, '张三', 999)).rejects.toThrow('转交目标用户不存在');
  });

  it('成功转交审批', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);
    mockAppQuery.mockResolvedValueOnce({ rows: [{ name: '李四' }], rowCount: 1 } as any);

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // advisory lock
          .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] }) // SELECT instance FOR UPDATE
          .mockResolvedValueOnce({ rows: [] }) // UPDATE node
          .mockResolvedValueOnce({ rows: [] }) // INSERT action (transfer)
          .mockResolvedValueOnce({ rows: [] }), // INSERT action (comment) - 统一评论模型新增
      };
      return fn(mockClient);
    });

    await transferApproval(1, 5, '张三', 10, '请帮忙处理');
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('未找到待审批节点时抛出异常', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);
    mockAppQuery.mockResolvedValueOnce({ rows: [{ name: '李四' }], rowCount: 1 } as any);
    mockGetCurrentNode.mockResolvedValueOnce(null as any);

    mockTransaction.mockImplementationOnce(async (fn: any) => fn(createMockClient()));

    await expect(transferApproval(1, 5, '张三', 10)).rejects.toThrow('未找到待审批节点');
  });
});
