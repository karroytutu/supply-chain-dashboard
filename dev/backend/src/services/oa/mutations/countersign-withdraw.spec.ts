/**
 * OA - 加签 + 撤回操作 测试
 * @module services/oa/mutations/countersign-withdraw.spec
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

import { countersignApproval, withdrawApproval } from './countersign-withdraw';
import { appQuery } from '../../../db/appPool';
import { isCurrentApprover, isApplicant, getCurrentApproverNode } from '../oa-utils';
import { insertNodeAfter, transaction } from './shared-utils';

// Mock dependencies
jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
}));
jest.mock('../oa-utils', () => ({
  isCurrentApprover: jest.fn(),
  isApplicant: jest.fn(),
  getCurrentApproverNode: jest.fn(),
}));
jest.mock('../oa-notify', () => ({}));
jest.mock('../oa-async-task.service', () => ({
  enqueueCompleteAllPendingTodos: jest.fn().mockResolvedValue(undefined),
  enqueueSendApprovalNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./shared-utils', () => ({
  insertNodeAfter: jest.fn(),
  transaction: jest.fn((fn: any) => {
    const mockClient = {
      query: jest.fn(),
    };
    return fn(mockClient);
  }),
  getInstanceNotifyData: jest.fn().mockResolvedValue(null),
}));

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockIsCurrentApprover = isCurrentApprover as jest.MockedFunction<typeof isCurrentApprover>;
const mockIsApplicant = isApplicant as jest.MockedFunction<typeof isApplicant>;
const mockGetCurrentApproverNode = getCurrentApproverNode as jest.MockedFunction<typeof getCurrentApproverNode>;
const mockInsertNodeAfter = insertNodeAfter as jest.MockedFunction<typeof insertNodeAfter>;
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
              applicant_id: 100,
              current_node_order: 2,
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
});

afterEach(() => {
  jest.useRealTimers();
});

describe('countersignApproval', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('非当前审批人时抛出错误', async () => {
    mockIsCurrentApprover.mockResolvedValue(false);

    await expect(
      countersignApproval(1, 100, '张三', 'after', [200])
    ).rejects.toThrow('您不是当前审批人，无法执行此操作');
  });

  it('未选择加签人时抛出错误', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);

    await expect(
      countersignApproval(1, 100, '张三', 'after', [])
    ).rejects.toThrow('请选择至少一个加签人');
  });

  it('后加签：成功调用 insertNodeAfter', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockAppQuery.mockResolvedValue({ rows: [{ id: 200, name: '李四' }] } as any);
    mockGetCurrentApproverNode.mockResolvedValue({ id: 10, node_order: 2 } as any);
    mockInsertNodeAfter.mockResolvedValue({ id: 11 } as any);

    // Mock transaction 的 client.query
    const mockClient = createMockClient();
    mockTransaction.mockImplementation(async (fn: any) => fn(mockClient));

    await countersignApproval(1, 100, '张三', 'after', [200]);

    expect(mockInsertNodeAfter).toHaveBeenCalledWith(
      expect.any(Object),
      1,
      2, // currentNode.node_order (后加签)
      expect.objectContaining({
        name: '加签',
        type: 'approval',
        assignedUserIds: [200],
      })
    );
  });

  it('前加签：insertNodeAfter 使用 node_order - 1', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockAppQuery.mockResolvedValue({ rows: [{ id: 200, name: '李四' }] } as any);
    mockGetCurrentApproverNode.mockResolvedValue({ id: 10, node_order: 2 } as any);
    mockInsertNodeAfter.mockResolvedValue({ id: 11 } as any);

    const mockClient = createMockClient();
    mockTransaction.mockImplementation(async (fn: any) => fn(mockClient));

    await countersignApproval(1, 100, '张三', 'before', [200]);

    expect(mockInsertNodeAfter).toHaveBeenCalledWith(
      expect.any(Object),
      1,
      1, // currentNode.node_order - 1 (前加签)
      expect.objectContaining({
        name: '加签',
        type: 'approval',
      })
    );
  });

  it('多个加签人：逐个调用 insertNodeAfter', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockAppQuery.mockResolvedValue({ rows: [{ id: 200, name: '李四' }, { id: 300, name: '王五' }] } as any);
    mockGetCurrentApproverNode.mockResolvedValue({ id: 10, node_order: 2 } as any);
    mockInsertNodeAfter.mockResolvedValue({ id: 11 } as any);

    const mockClient = createMockClient();
    mockTransaction.mockImplementation(async (fn: any) => fn(mockClient));

    await countersignApproval(1, 100, '张三', 'after', [200, 300]);

    expect(mockInsertNodeAfter).toHaveBeenCalledTimes(2);
  });
});

describe('withdrawApproval', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('非申请人时抛出错误', async () => {
    mockIsApplicant.mockResolvedValue(false);

    await expect(
      withdrawApproval(1, 100, '张三')
    ).rejects.toThrow('只有申请人可以撤回审批');
  });

  it('审批实例不存在时抛出错误', async () => {
    mockIsApplicant.mockResolvedValue(true);
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] } as any) // advisory lock
        .mockResolvedValueOnce({ rows: [] } as any), // SELECT instance
    };
    mockTransaction.mockImplementation(async (fn: any) => fn(mockClient));

    await expect(
      withdrawApproval(1, 100, '张三')
    ).rejects.toThrow('审批实例不存在');
  });

  it('审批状态非 pending 时抛出错误', async () => {
    mockIsApplicant.mockResolvedValue(true);
    const mockClient = createMockClient({ status: 'approved' });
    mockTransaction.mockImplementation(async (fn: any) => fn(mockClient));

    await expect(
      withdrawApproval(1, 100, '张三')
    ).rejects.toThrow('只有审批中的申请可以撤回');
  });

  it('成功撤回审批', async () => {
    mockIsApplicant.mockResolvedValue(true);
    const mockClient = createMockClient();
    mockTransaction.mockImplementation(async (fn: any) => fn(mockClient));

    await withdrawApproval(1, 100, '张三');

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE oa_approval_instances SET status = 'withdrawn'"),
      [1]
    );
  });
});

// =====================================================
// 加签补充用例
// =====================================================

describe('countersignApproval - 补充', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getCurrentApproverNode 返回 null 时抛出"未找到待审批节点"', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockAppQuery.mockResolvedValue({ rows: [{ id: 200, name: '李四' }] } as any);
    mockGetCurrentApproverNode.mockResolvedValue(null);

    const mockClient = createMockClient();
    mockTransaction.mockImplementation(async (fn: any) => fn(mockClient));

    await expect(
      countersignApproval(1, 100, '张三', 'after', [200])
    ).rejects.toThrow('未找到待审批节点');
  });

  it('前加签时更新 current_node_order', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockAppQuery.mockResolvedValue({ rows: [{ id: 200, name: '李四' }] } as any);
    mockGetCurrentApproverNode.mockResolvedValue({ id: 10, node_order: 3 } as any);
    mockInsertNodeAfter.mockResolvedValue({ id: 11 } as any);

    const mockClient = createMockClient();
    mockTransaction.mockImplementation(async (fn: any) => fn(mockClient));

    await countersignApproval(1, 100, '张三', 'before', [200]);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE oa_approval_instances SET current_node_order = $1'),
      [3, 1]
    );
  });

  it('每个加签用户后执行 is_countersign 更新', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockAppQuery.mockResolvedValue({ rows: [{ id: 200, name: '李四' }] } as any);
    mockGetCurrentApproverNode.mockResolvedValue({ id: 10, node_order: 2 } as any);
    mockInsertNodeAfter.mockResolvedValue({ id: 11 } as any);

    const mockClient = createMockClient();
    mockTransaction.mockImplementation(async (fn: any) => fn(mockClient));

    await countersignApproval(1, 100, '张三', 'after', [200]);

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('SET is_countersign = true'),
      [10, 11] // [currentNode.id, insertedNode.id]
    );
  });

  it('操作记录插入包含 details JSON', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockAppQuery.mockResolvedValue({ rows: [{ id: 200, name: '李四' }] } as any);
    mockGetCurrentApproverNode.mockResolvedValue({ id: 10, node_order: 2 } as any);
    mockInsertNodeAfter.mockResolvedValue({ id: 11 } as any);

    const mockClient = createMockClient();
    mockTransaction.mockImplementation(async (fn: any) => fn(mockClient));

    await countersignApproval(1, 100, '张三', 'after', [200], '加签原因');

    const actionInsert = mockClient.query.mock.calls.find(
      (c: any) => typeof c[0] === 'string' && c[0].includes("action_type, 'countersign'")
        || (typeof c[0] === 'string' && c[0].includes('oa_approval_actions') && c[0].includes('countersign'))
    );
    expect(actionInsert).toBeDefined();
    // details 参数包含 countersignType 和 countersignUserIds（attachments 在最后，details 在倒数第二）
    const params = actionInsert![1];
    const detailsJson = JSON.parse(params[params.length - 2]);
    expect(detailsJson.countersignType).toBe('after');
    expect(detailsJson.countersignUserIds).toEqual([200]);
  });

  it('后加签时不更新 current_node_order', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockAppQuery.mockResolvedValue({ rows: [{ id: 200, name: '李四' }] } as any);
    mockGetCurrentApproverNode.mockResolvedValue({ id: 10, node_order: 2 } as any);
    mockInsertNodeAfter.mockResolvedValue({ id: 11 } as any);

    const mockClient = createMockClient();
    mockTransaction.mockImplementation(async (fn: any) => fn(mockClient));

    await countersignApproval(1, 100, '张三', 'after', [200]);

    const updateCall = mockClient.query.mock.calls.find(
      (c: any) => typeof c[0] === 'string' && c[0].includes('SET current_node_order')
    );
    expect(updateCall).toBeUndefined();
  });

  it('后加签多人时 insertNodeAfter 的 afterOrder 逐次递增', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockAppQuery.mockResolvedValue({ rows: [{ id: 200, name: '李四' }, { id: 300, name: '王五' }] } as any);
    mockGetCurrentApproverNode.mockResolvedValue({ id: 10, node_order: 2 } as any);
    mockInsertNodeAfter.mockResolvedValue({ id: 11 } as any);

    const mockClient = createMockClient();
    mockTransaction.mockImplementation(async (fn: any) => fn(mockClient));

    await countersignApproval(1, 100, '张三', 'after', [200, 300]);

    // 第1次调用 afterOrder=2（currentNode.node_order），第2次 afterOrder=3（递增）
    expect(mockInsertNodeAfter).toHaveBeenNthCalledWith(1, expect.any(Object), 1, 2, expect.objectContaining({ assignedUserIds: [200] }));
    expect(mockInsertNodeAfter).toHaveBeenNthCalledWith(2, expect.any(Object), 1, 3, expect.objectContaining({ assignedUserIds: [300] }));
  });
});
