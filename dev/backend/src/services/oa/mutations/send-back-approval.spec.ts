/**
 * OA 退回操作（流转路由）单元测试
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn().mockResolvedValue({ rows: [] }),
}));

jest.mock('../oa-utils', () => ({
  isCurrentApprover: jest.fn(),
  getCurrentApproverNode: jest.fn().mockResolvedValue({ id: 100, node_order: 4, node_type: 'approval', role_code: 'current_accountant', assigned_user_ids: [5] }),
}));

jest.mock('../form-types', () => ({
  getFormTypeByCode: jest.fn(),
}));

jest.mock('../oa-async-task.service', () => ({
  enqueueCompleteApprovalTodo: jest.fn().mockResolvedValue(undefined),
  enqueueSendApprovalNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./shared-utils', () => ({
  transaction: jest.fn(),
  sendBackToNode: jest.fn().mockResolvedValue(undefined),
}));

import { appQuery } from '../../../db/appPool';
import { isCurrentApprover, getCurrentApproverNode } from '../oa-utils';
import { transaction, sendBackToNode } from './shared-utils';
import { sendBackApproval } from './send-back-approval';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockIsCurrentApprover = isCurrentApprover as jest.MockedFunction<typeof isCurrentApprover>;
const mockGetCurrentNode = getCurrentApproverNode as jest.MockedFunction<typeof getCurrentApproverNode>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;
const mockSendBackToNode = sendBackToNode as jest.MockedFunction<typeof sendBackToNode>;

/** 创建 mock client，模拟事务内查询 */
function createMockClient(opts: {
  instanceStatus?: string;
  currentNodeOrder?: number;
  currentNodeType?: string;
  targetNodeType?: string;
  hasAutoBetween?: boolean;
  targetRoleCode?: string;
} = {}) {
  const {
    instanceStatus = 'pending',
    currentNodeOrder = 4,
    currentNodeType = 'approval',
    targetNodeType = 'approval',
    hasAutoBetween = false,
    targetRoleCode = 'marketer',
  } = opts;

  return {
    query: jest.fn().mockImplementation((sql: string, params?: any[]) => {
      // 分布式锁
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };

      // 查询实例
      if (sql.includes('oa_approval_instances') && sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 1, status: instanceStatus, current_node_order: currentNodeOrder, form_type_id: 10 }] };
      }

      // 获取目标节点（ORDER BY round DESC LIMIT 1）
      if (sql.includes('oa_approval_nodes') && sql.includes('node_order') && sql.includes('LIMIT 1') && !sql.includes('auto') && !sql.includes('assigned_user_ids') && !sql.includes('status')) {
        return { rows: [{ id: 200, node_order: params?.[1] ?? 1, node_type: targetNodeType, role_code: targetRoleCode, assigned_user_ids: null, round: 1 }] };
      }

      // 检查中间 auto 节点
      if (sql.includes("node_type = 'auto'") && sql.includes('pending')) {
        return { rows: hasAutoBetween ? [{ id: 300, node_name: '核销校验' }] : [] };
      }

      // 角色解析查询
      if (sql.includes('user_roles')) {
        return { rows: [{ user_id: 42 }] };
      }

      // 其他 UPDATE/INSERT 查询
      return { rows: [] };
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// 校验测试
// =====================================================

describe('sendBackApproval - 校验', () => {
  it('非当前审批人应抛出错误', async () => {
    mockIsCurrentApprover.mockResolvedValue(false);

    await expect(sendBackApproval(1, 5, '张三', 1))
      .rejects.toThrow('您不是当前审批人');
  });

  it('退回目标环节序号 >= 当前环节序号应抛出错误', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockGetCurrentNode.mockResolvedValueOnce({ id: 100, node_order: 2, node_type: 'approval', role_code: 'current_accountant', assigned_user_ids: [5] } as any);
    const mockClient = createMockClient({ currentNodeOrder: 2 });
    mockTransaction.mockImplementation(async (cb: any) => cb(mockClient));

    // targetNodeOrder=3 不小于 currentNodeOrder=2
    await expect(sendBackApproval(1, 5, '张三', 3))
      .rejects.toThrow('退回目标环节必须在当前环节之前');
  });

  it('退回到 auto 类型环节应抛出错误', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockGetCurrentNode.mockResolvedValueOnce({ id: 100, node_order: 8, node_type: 'approval', role_code: 'current_accountant', assigned_user_ids: [5] } as any);
    const mockClient = createMockClient({ currentNodeOrder: 8, targetNodeType: 'auto' });
    mockTransaction.mockImplementation(async (cb: any) => cb(mockClient));

    await expect(sendBackApproval(1, 5, '张三', 7))
      .rejects.toThrow('不能退回到自动环节');
  });

  it('中间存在 pending/processing auto 节点应抛出错误', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockGetCurrentNode.mockResolvedValueOnce({ id: 100, node_order: 4, node_type: 'approval', role_code: 'current_accountant', assigned_user_ids: [5] } as any);
    const mockClient = createMockClient({ currentNodeOrder: 4, hasAutoBetween: true });
    mockTransaction.mockImplementation(async (cb: any) => cb(mockClient));

    await expect(sendBackApproval(1, 5, '张三', 1))
      .rejects.toThrow('无法退回：目标环节与当前环节之间存在未完成的自动环节');
  });
});

// =====================================================
// 正常退回测试
// =====================================================

describe('sendBackApproval - 正常退回', () => {
  it('退回到前序环节不终止实例', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockGetCurrentNode.mockResolvedValueOnce({ id: 100, node_order: 4, node_type: 'approval', role_code: 'current_accountant', assigned_user_ids: [5] } as any);
    const mockClient = createMockClient({ currentNodeOrder: 4 });
    mockTransaction.mockImplementation(async (cb: any) => cb(mockClient));

    await sendBackApproval(1, 5, '张三', 1);

    // 验证调用了 sendBackToNode（通用退回函数）
    expect(mockSendBackToNode).toHaveBeenCalledWith(
      mockClient, 1,
      100, 4,  // currentNode.id, currentNode.node_order
      1        // targetNodeOrder
    );
  });

  it('退回原因（comment）为选填', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockGetCurrentNode.mockResolvedValueOnce({ id: 100, node_order: 4, node_type: 'approval', role_code: 'current_accountant', assigned_user_ids: [5] } as any);
    const mockClient = createMockClient({ currentNodeOrder: 4 });
    mockTransaction.mockImplementation(async (cb: any) => cb(mockClient));

    // 不传 comment 不应报错
    await expect(sendBackApproval(1, 5, '张三', 1))
      .resolves.not.toThrow();
  });

  it('退回后调用了 sendBackToNode 处理中间环节', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockGetCurrentNode.mockResolvedValueOnce({ id: 100, node_order: 4, node_type: 'approval', role_code: 'current_accountant', assigned_user_ids: [5] } as any);
    const mockClient = createMockClient({ currentNodeOrder: 4 });
    mockTransaction.mockImplementation(async (cb: any) => cb(mockClient));

    await sendBackApproval(1, 5, '张三', 1);

    // sendBackToNode 内部会处理：当前环节 → send_back，目标/中间环节 → pending，更新指针
    expect(mockSendBackToNode).toHaveBeenCalledTimes(1);
    expect(mockSendBackToNode).toHaveBeenCalledWith(
      mockClient, 1,
      100, 4,  // currentNode.id=100, currentNode.node_order=4
      1        // targetNodeOrder=1
    );
  });

  it('退回后操作日志被记录', async () => {
    mockIsCurrentApprover.mockResolvedValue(true);
    mockGetCurrentNode.mockResolvedValueOnce({ id: 100, node_order: 4, node_type: 'approval', role_code: 'current_accountant', assigned_user_ids: [5] } as any);
    const mockClient = createMockClient({ currentNodeOrder: 4 });
    mockTransaction.mockImplementation(async (cb: any) => cb(mockClient));

    await sendBackApproval(1, 5, '张三', 1, '信息有误');

    // 验证 send_back 操作日志被插入
    const actionCalls = mockClient.query.mock.calls.filter(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes("'send_back'")
    );
    expect(actionCalls.length).toBeGreaterThan(0);
  });
});
