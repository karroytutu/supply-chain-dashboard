/**
 * OA 自动节点操作单元测试
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));

jest.mock('../form-types', () => ({
  getFormTypeByCode: jest.fn(),
}));

jest.mock('../oa-notify', () => ({
  notifyPendingApproval: jest.fn().mockResolvedValue(undefined),
  notifyApproved: jest.fn().mockResolvedValue(undefined),
  notifyCc: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../oa-process-centre', () => ({
  finalizeProcessInstance: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../oa-utils', () => ({
  findUserIdsByRoleCodes: jest.fn().mockResolvedValue([]),
}));

jest.mock('./shared-utils', () => ({
  transaction: jest.fn(),
  getInstanceNotifyData: jest.fn(),
}));

jest.mock('../../fixed-asset/erp-meta-utils', () => ({
  markErpFailed: jest.fn().mockResolvedValue(undefined),
}));

import { appQuery } from '../../../db/appPool';
import { getFormTypeByCode } from '../form-types';
import { notifyPendingApproval, notifyApproved, notifyCc } from '../oa-notify';
import { finalizeProcessInstance } from '../oa-process-centre';
import { findUserIdsByRoleCodes } from '../oa-utils';
import { transaction, getInstanceNotifyData } from './shared-utils';
import {
  executeAutoNodeCallback,
  retryAutoNode,
  triggerCcIfApplicable,
  sendApprovalNotifications,
} from './auto-node-operations';

const mockQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;

const mkInstance = (overrides: any = {}) => ({
  id: 1,
  instance_no: 'OA-001',
  title: '测试',
  applicant_id: 10,
  applicant_name: '申请人',
  form_type_id: 100,
  form_data: {},
  status: 'pending',
  current_node_order: 1,
  ...overrides,
});

const mkNode = (overrides: any = {}) => ({
  id: 100,
  instance_id: 1,
  node_order: 1,
  node_name: '自动节点',
  node_type: 'auto',
  assigned_user_id: null,
  status: 'pending',
  ...overrides,
});

const mkFormType = (overrides: any = {}) => ({
  code: 'test_form',
  name: '测试表单',
  formSchema: { fields: [] },
  onApproved: jest.fn().mockResolvedValue(undefined),
  workflowDef: {},
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
  mockTransaction.mockImplementation(async (fn: any) => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 } as any),
    };
    return fn(client);
  });
});

describe('executeAutoNodeCallback', () => {
  it('节点已被处理时跳过（幂等保护）', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    const ft = mkFormType();
    await executeAutoNodeCallback(1, mkNode(), ft as any, mkInstance(), {});
    expect(ft.onApproved).not.toHaveBeenCalled();
  });

  it('成功执行 - 无后续节点（末位 auto）', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)   // claim
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // finalCheck (无阻塞)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // node → approved
      .mockResolvedValueOnce({ rows: [{ max_order: 1 }] } as any) // ccTriggerOrder
      .mockResolvedValueOnce({ rows: [] } as any)                 // next node
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);   // instance → approved + erp_meta cleanup
    const ft = mkFormType();
    await executeAutoNodeCallback(1, mkNode(), ft as any, mkInstance(), { key: 'v' });
    expect(ft.onApproved).toHaveBeenCalledTimes(1);
    expect(finalizeProcessInstance).toHaveBeenCalledWith(1, 'agree');
    // 验证 erp_meta 被清理
    const erpMetaCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && (c[0] as string).includes('erp_meta')
        && (c[0] as string).includes("'approved'")
    );
    expect(erpMetaCall).toBeTruthy();
  });

  it('成功执行 - 下一节点为人工审批时更新实例状态并清理 erp_meta', async () => {
    const nextNode = mkNode({ id: 200, node_order: 2, node_type: 'approval', assigned_user_id: 20 });
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)   // claim
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // finalCheck (无阻塞)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // node → approved
      .mockResolvedValueOnce({ rows: [{ max_order: 1 }] } as any) // triggerCcIfApplicable MAX query
      .mockResolvedValueOnce({ rows: [nextNode] } as any)         // next node query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);   // instance → pending + erp_meta cleanup
    await executeAutoNodeCallback(1, mkNode(), mkFormType() as any, mkInstance(), {});
    // verify erp_meta cleanup: 某个 SQL 包含 jsonb_set
    const jsonbCalls = mockQuery.mock.calls.filter(
      c => typeof c[0] === 'string' && (c[0] as string).includes('jsonb_set')
    );
    expect(jsonbCalls.length).toBeGreaterThan(0);
  });

  it('成功执行 - 下一节点仍为 auto（递归）', async () => {
    const autoNode2 = mkNode({ id: 200, node_order: 2, node_type: 'auto' });
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)   // claim node1
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // finalCheck node1 (无阻塞)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // node1 → approved
      .mockResolvedValueOnce({ rows: [{ max_order: 2 }] } as any) // cc
      .mockResolvedValueOnce({ rows: [autoNode2] } as any)        // next = auto
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // update current_node
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)   // claim node2
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // finalCheck node2 (无阻塞)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // node2 → approved
      .mockResolvedValueOnce({ rows: [{ max_order: 2 }] } as any) // cc node2
      .mockResolvedValueOnce({ rows: [] } as any)                 // no next
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);   // instance → approved
    const ft = mkFormType();
    await executeAutoNodeCallback(1, mkNode(), ft as any, mkInstance(), {});
    expect(ft.onApproved).toHaveBeenCalledTimes(2);
  });

  it('执行失败 → 节点标记为failed，实例标记为erp_failed', async () => {
    const ft = mkFormType({ onApproved: jest.fn().mockRejectedValue(new Error('ERP boom')) });
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)  // claim
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)  // finalCheck (无阻塞)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)  // node → failed
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // instance → erp_failed
    await executeAutoNodeCallback(1, mkNode(), ft as any, mkInstance(), {});
    // verify node marked as failed
    const failedCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && (c[0] as string).includes("'failed'")
    );
    expect(failedCall).toBeTruthy();
    // verify instance marked as erp_failed
    const erpFailedCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && (c[0] as string).includes("'erp_failed'")
    );
    expect(erpFailedCall).toBeTruthy();
  });

  it('最终防线：人工环节未完成时中止 auto 节点执行', async () => {
    const ft = mkFormType();
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)  // claim 成功
      .mockResolvedValueOnce({ rows: [{ id: 50, node_name: '营销经理审批', status: 'pending' }] } as any) // finalCheck 发现阻塞
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)  // 回退 auto 节点
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // 回退实例状态
    await executeAutoNodeCallback(1, mkNode(), ft as any, mkInstance(), {});
    expect(ft.onApproved).not.toHaveBeenCalled(); // 回调未执行
    // 验证 auto 节点被回退为 pending
    const revertCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && (c[0] as string).includes("'pending'")
    );
    expect(revertCall).toBeTruthy();
  });

  it('auto 节点后有 pending 人工节点时不阻塞执行（仅检查 node_order 之前的节点）', async () => {
    // 场景：节点1=auto(order=1), 节点2=人工(order=2, pending)
    // finalCheck 仅检查 node_order < 1 的节点，不会发现节点2，因此正常执行
    const ft = mkFormType();
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)   // claim
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // finalCheck (无阻塞，节点2在 auto 之后不算)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // node → approved
      .mockResolvedValueOnce({ rows: [{ max_order: 2 }] } as any) // ccTriggerOrder
      .mockResolvedValueOnce({ rows: [] } as any)                 // next node (无人工节点待审批)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);   // instance → approved
    await executeAutoNodeCallback(1, mkNode({ node_order: 1 }), ft as any, mkInstance(), {});
    expect(ft.onApproved).toHaveBeenCalledTimes(1); // 回调正常执行
    // 验证 finalCheck SQL 包含 node_order 过滤
    const finalCheckCall = mockQuery.mock.calls[1];
    const finalCheckSql = finalCheckCall[0] as string;
    expect(finalCheckSql).toContain('node_order');
    // 验证 finalCheck 参数包含 autoNode.node_order
    expect(finalCheckCall[1]).toContain(1);
  });
});

describe('retryAutoNode', () => {
  it('实例不存在时抛出异常', async () => {
    mockTransaction.mockImplementation(async (fn: any) => {
      const client = { query: jest.fn().mockResolvedValueOnce({ rows: [] } as any) };
      return fn(client);
    });
    await expect(retryAutoNode(999)).rejects.toThrow('审批实例不存在');
  });

  it('审批已处于终态时抛出异常', async () => {
    mockTransaction.mockImplementation(async (fn: any) => {
      const client = {
        query: jest.fn().mockResolvedValueOnce({ rows: [mkInstance({ status: 'approved' })] } as any),
      };
      return fn(client);
    });
    await expect(retryAutoNode(1)).rejects.toThrow('审批已处于终态');
  });

  it('未找到需要重试的 auto 节点时抛出异常', async () => {
    mockTransaction.mockImplementation(async (fn: any) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [mkInstance()] } as any)
          // 第二个查询：auto 节点查询返回空（没有找到 pending/failed 的 auto 节点）
          .mockResolvedValueOnce({ rows: [] } as any),
      };
      return fn(client);
    });
    await expect(retryAutoNode(1)).rejects.toThrow('未找到需要重试的 auto 节点');
  });

  it('auto 节点前仍有未完成人工节点时拒绝重试', async () => {
    const inst = mkInstance({ status: 'erp_failed', erp_meta: { status: 'failed', retries: 1 } });
    const node = mkNode({ status: 'failed', node_order: 2 });
    mockTransaction.mockImplementation(async (fn: any) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [inst] } as any)   // SELECT instance
          .mockResolvedValueOnce({ rows: [node] } as any)   // SELECT auto node
          .mockResolvedValueOnce({ rows: [{ id: 1, node_name: '营销师催收', status: 'pending' }] } as any), // pendingBeforeCheck
      };
      return fn(client);
    });
    await expect(retryAutoNode(1)).rejects.toThrow('auto 节点前仍有未完成节点');
  });

  it('成功重试并执行回调', async () => {
    const inst = mkInstance({ status: 'erp_failed', erp_meta: { status: 'failed', retries: 1 } });
    const node = mkNode({ status: 'failed' });
    mockTransaction.mockImplementation(async (fn: any) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [inst] } as any)   // SELECT instance
          .mockResolvedValueOnce({ rows: [node] } as any)   // SELECT auto node
          .mockResolvedValueOnce({ rows: [] } as any)       // pendingBeforeCheck (无阻塞节点)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // erp_meta update
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // node reset
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any), // action insert
      };
      return fn(client);
    });
    // after transaction: form type lookup, instance re-fetch
    mockQuery
      .mockResolvedValueOnce({ rows: [{ code: 'test_form' }] } as any)
      .mockResolvedValueOnce({ rows: [mkInstance()] } as any)
      // executeAutoNodeCallback queries
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
      .mockResolvedValueOnce({ rows: [{ max_order: 1 }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
    (getFormTypeByCode as jest.Mock).mockReturnValue(mkFormType());
    await retryAutoNode(1);
    expect(getFormTypeByCode).toHaveBeenCalledWith('test_form');
  });
});

describe('triggerCcIfApplicable', () => {
  const inst = mkInstance();

  it('节点非末位时不触发抄送', async () => {
    await triggerCcIfApplicable(1, 1, mkFormType() as any, inst);
    expect(notifyCc).not.toHaveBeenCalled();
  });

  it('无 CC 角色时不触发抄送', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ max_order: 2 }] } as any);
    await triggerCcIfApplicable(1, 2, mkFormType() as any, inst);
    expect(notifyCc).not.toHaveBeenCalled();
  });

  it('有 CC 角色时创建抄送记录并通知', async () => {
    const ft = mkFormType({ workflowDef: { ccAfterNode: 1, ccRoles: ['manager'] } });
    mockQuery
      .mockResolvedValueOnce({ rows: [inst] } as any)              // fresh instance
      .mockResolvedValueOnce({ rows: [{ id: 30, name: '经理' }] } as any) // users
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);    // INSERT cc
    (findUserIdsByRoleCodes as jest.Mock).mockResolvedValue([30]);
    await triggerCcIfApplicable(1, 1, ft as any, inst);
    expect(notifyCc).toHaveBeenCalledWith(expect.objectContaining({ instanceId: 1 }), [30]);
  });

  it('过滤申请人不接收抄送', async () => {
    const ft = mkFormType({ workflowDef: { ccAfterNode: 1, ccRoles: ['manager'] } });
    mockQuery.mockResolvedValueOnce({ rows: [inst] } as any);
    (findUserIdsByRoleCodes as jest.Mock).mockResolvedValue([inst.applicant_id]);
    await triggerCcIfApplicable(1, 1, ft as any, inst);
    expect(notifyCc).not.toHaveBeenCalled();
  });
});

describe('sendApprovalNotifications', () => {
  it('通知数据不存在时静默返回', async () => {
    (getInstanceNotifyData as jest.Mock).mockResolvedValue(null);
    await sendApprovalNotifications(1, 5, '审批人', mkInstance(), mkFormType() as any, true);
    expect(notifyApproved).not.toHaveBeenCalled();
  });

  it('末位节点 → 通知申请人', async () => {
    const inst = mkInstance();
    (getInstanceNotifyData as jest.Mock).mockResolvedValue({
      formTypeName: '测试', formType: mkFormType(),
    });
    await sendApprovalNotifications(1, 5, '审批人', inst, mkFormType() as any, true);
    expect(notifyApproved).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 1 }),
      inst.applicant_id,
    );
  });

  it('非末位节点 → 通知下一审批人', async () => {
    (getInstanceNotifyData as jest.Mock).mockResolvedValue({
      formTypeName: '测试', formType: mkFormType(),
    });
    mockQuery
      .mockResolvedValueOnce({ rows: [{ assigned_user_id: 20, node_name: '二审', node_order: 2 }] } as any)
      .mockResolvedValueOnce({ rows: [mkInstance()] } as any);
    await sendApprovalNotifications(1, 5, '审批人', mkInstance(), mkFormType() as any, false);
    expect(notifyPendingApproval).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 1, nodeName: '二审' }),
      [20],
    );
  });

  it('下一节点无 assigned_user_id 时不通知', async () => {
    (getInstanceNotifyData as jest.Mock).mockResolvedValue({
      formTypeName: '测试', formType: mkFormType(),
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ assigned_user_id: null, node_name: '空', node_order: 2 }] } as any);
    await sendApprovalNotifications(1, 5, '审批人', mkInstance(), mkFormType() as any, false);
    expect(notifyPendingApproval).not.toHaveBeenCalled();
  });
});
