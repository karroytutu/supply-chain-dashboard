/**
 * OA 加签 + 撤回操作单元测试
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));

jest.mock('../oa-utils', () => ({
  isCurrentApprover: jest.fn(),
  isApplicant: jest.fn(),
  getCurrentApproverNode: jest.fn(),
}));

jest.mock('../oa-notify', () => ({
  notifyCountersign: jest.fn().mockResolvedValue(undefined),
  notifyWithdrawn: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../oa-process-centre', () => ({
  completeAllPendingTodos: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./shared-utils', () => ({
  transaction: jest.fn(),
  getInstanceNotifyData: jest.fn(),
}));

import { appQuery } from '../../../db/appPool';
import { isCurrentApprover, isApplicant, getCurrentApproverNode } from '../oa-utils';
import { notifyCountersign, notifyWithdrawn } from '../oa-notify';
import { completeAllPendingTodos } from '../oa-process-centre';
import { transaction, getInstanceNotifyData } from './shared-utils';
import { countersignApproval, withdrawApproval } from './countersign-withdraw';

const mockQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockIsCurrentApprover = isCurrentApprover as jest.MockedFunction<typeof isCurrentApprover>;
const mockIsApplicant = isApplicant as jest.MockedFunction<typeof isApplicant>;
const mockGetCurrentNode = getCurrentApproverNode as jest.MockedFunction<typeof getCurrentApproverNode>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;

const defaultNode = { id: 10, node_order: 1, node_type: 'role' as const, node_name: '审批', assigned_user_id: 5 };

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
  mockGetCurrentNode.mockResolvedValue(defaultNode as any);
  mockTransaction.mockImplementation(async (fn: any) => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 } as any) };
    return fn(client);
  });
});

describe('countersignApproval', () => {
  const currentNode = { id: 10, node_order: 1, node_type: 'role' as const, node_name: '审批', assigned_user_id: 5 };

  it('非当前审批人时抛出异常', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(false);
    await expect(countersignApproval(1, 5, '张三', 'before', [20])).rejects.toThrow('您不是当前审批人');
  });

  it('加签人为空时抛出异常', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);
    await expect(countersignApproval(1, 5, '张三', 'before', [])).rejects.toThrow('请选择至少一个加签人');
  });

  it('前加签 - 成功插入加签节点并移动原节点', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 20, name: '李四' }] } as any);

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [currentNode] } as any)      // getCurrentApproverNode
      .mockResolvedValueOnce({ rows: [currentNode] } as any)      // allNodes
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)    // shift original node
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)    // insert countersign node
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)    // update current_node_order
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);   // insert action
    mockTransaction.mockImplementationOnce(async (fn: any) => fn({ query: clientQuery }));

    await countersignApproval(1, 5, '张三', 'before', [20]);
    expect(clientQuery).toHaveBeenCalled();
  });

  it('后加签 - 成功插入加签节点在当前节点之后', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 20, name: '李四' }, { id: 30, name: '王五' }] } as any);

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [currentNode] } as any)
      .mockResolvedValueOnce({ rows: [currentNode, { id: 11, node_order: 2 }] } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)    // shift node_order > 1
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)    // insert countersign 1
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)    // insert countersign 2
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);   // insert action
    mockTransaction.mockImplementationOnce(async (fn: any) => fn({ query: clientQuery }));

    await countersignApproval(1, 5, '张三', 'after', [20, 30]);
    expect(clientQuery).toHaveBeenCalled();
  });

  it('未找到待审批节点时抛出异常', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 20, name: '李四' }] } as any);
    (getCurrentApproverNode as jest.Mock).mockResolvedValueOnce(null);

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] } as any)  // getCurrentApproverNode returns null
      .mockResolvedValueOnce({ rows: [] } as any);
    mockTransaction.mockImplementationOnce(async (fn: any) => fn({ query: clientQuery }));

    // The error comes from inside transaction
    await expect(countersignApproval(1, 5, '张三', 'before', [20])).rejects.toThrow();
  });

  it('加签后异步发送通知', async () => {
    mockIsCurrentApprover.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 20, name: '李四' }] } as any);

    const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 } as any);
    clientQuery
      .mockResolvedValueOnce({ rows: [currentNode] } as any)
      .mockResolvedValueOnce({ rows: [currentNode] } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    mockTransaction.mockImplementationOnce(async (fn: any) => fn({ query: clientQuery }));

    (getInstanceNotifyData as jest.Mock).mockResolvedValue({
      instance: { instance_no: 'OA-001', title: '测试', applicant_name: '申请人', form_data: {} },
      formTypeName: '测试表单',
      formType: { formSchema: { fields: [] } },
    });

    await countersignApproval(1, 5, '张三', 'before', [20]);
    // flush setImmediate
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    expect(notifyCountersign).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 1, fromUserName: '张三' }),
      [20],
    );
  });
});

describe('withdrawApproval', () => {
  const mkInstance = (overrides: any = {}) => ({
    id: 1,
    instance_no: 'OA-001',
    title: '测试',
    applicant_id: 10,
    applicant_name: '申请人',
    status: 'pending',
    form_data: {},
    form_type_id: 100,
    ...overrides,
  });

  it('非申请人时抛出异常', async () => {
    mockIsApplicant.mockResolvedValueOnce(false);
    await expect(withdrawApproval(1, 99, '非法用户')).rejects.toThrow('只有申请人可以撤回审批');
  });

  it('审批实例不存在时抛出异常', async () => {
    mockIsApplicant.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    await expect(withdrawApproval(1, 10, '申请人')).rejects.toThrow('审批实例不存在');
  });

  it('非 pending 状态时抛出异常', async () => {
    mockIsApplicant.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce({ rows: [mkInstance({ status: 'approved' })] } as any);
    await expect(withdrawApproval(1, 10, '申请人')).rejects.toThrow('只有审批中的申请可以撤回');
  });

  it('成功撤回 - 更新实例状态并取消待审批节点', async () => {
    mockIsApplicant.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce({ rows: [mkInstance()] } as any);

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)   // instance → withdrawn
      .mockResolvedValueOnce({ rows: [], rowCount: 2 } as any)   // nodes → cancelled
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);  // insert action
    mockTransaction.mockImplementationOnce(async (fn: any) => fn({ query: clientQuery }));

    await withdrawApproval(1, 10, '申请人');
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'withdrawn'"), expect.any(Array));
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("status = 'cancelled'"), expect.any(Array));
  });

  it('撤回后异步发送通知和取消待办', async () => {
    mockIsApplicant.mockResolvedValueOnce(true);
    mockQuery.mockResolvedValueOnce({ rows: [mkInstance()] } as any);

    const clientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 } as any);
    mockTransaction.mockImplementationOnce(async (fn: any) => fn({ query: clientQuery }));

    (getInstanceNotifyData as jest.Mock).mockResolvedValue({
      instance: { instance_no: 'OA-001', title: '测试', applicant_name: '申请人', form_data: {} },
      formTypeName: '测试表单',
      formType: { formSchema: { fields: [] } },
    });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ assigned_user_id: 20 }] } as any);  // cancelled approvers

    await withdrawApproval(1, 10, '申请人');
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    expect(completeAllPendingTodos).toHaveBeenCalledWith(1, 'refuse');
    expect(notifyWithdrawn).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 1 }),
      [20],
    );
  });
});
