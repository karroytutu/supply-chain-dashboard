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
}));

jest.mock('../../fixed-asset/erp-meta-utils', () => ({
  markErpFailed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../oa-async-task.service', () => ({
  enqueueExecuteAutoNode: jest.fn().mockResolvedValue(undefined),
  enqueueFinalizeProcessInstance: jest.fn().mockResolvedValue(undefined),
  enqueueSendApprovalNotification: jest.fn().mockResolvedValue(undefined),
}));

import { appQuery } from '../../../db/appPool';
import { getFormTypeByCode } from '../form-types';
import { notifyCc } from '../oa-notify';
import { finalizeProcessInstance } from '../oa-process-centre';
import { findUserIdsByRoleCodes } from '../oa-utils';
import { transaction } from './shared-utils';
import { enqueueExecuteAutoNode, enqueueFinalizeProcessInstance, enqueueSendApprovalNotification } from '../oa-async-task.service';
import {
  executeAutoNodeCallback,
  retryAutoNode,
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
  assigned_user_ids: null,
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
      .mockResolvedValueOnce({ rows: [] } as any)                 // next node
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);   // instance → approved + erp_meta cleanup
    const ft = mkFormType();
    await executeAutoNodeCallback(1, mkNode(), ft as any, mkInstance(), { key: 'v' });
    expect(ft.onApproved).toHaveBeenCalledTimes(1);
    expect(enqueueFinalizeProcessInstance).toHaveBeenCalledWith(1, 'agree');
    // 验证 erp_meta 被清理
    const erpMetaCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && (c[0] as string).includes('erp_meta')
        && (c[0] as string).includes("'approved'")
    );
    expect(erpMetaCall).toBeTruthy();
  });

  it('成功执行 - 下一节点为人工审批时更新实例状态并清理 erp_meta', async () => {
    const nextNode = mkNode({ id: 200, node_order: 2, node_type: 'approval', assigned_user_ids: [20] });
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)   // claim
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // finalCheck (无阻塞)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // node → approved
      .mockResolvedValueOnce({ rows: [nextNode] } as any)         // next node query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);   // instance → pending + erp_meta cleanup
    await executeAutoNodeCallback(1, mkNode(), mkFormType() as any, mkInstance(), {});
    // verify erp_meta cleanup: 某个 SQL 包含 jsonb_set
    const jsonbCalls = mockQuery.mock.calls.filter(
      c => typeof c[0] === 'string' && (c[0] as string).includes('jsonb_set')
    );
    expect(jsonbCalls.length).toBeGreaterThan(0);
  });

  it('成功执行 - 下一节点仍为 auto 时 setImmediate 立即执行 + enqueue 兜底', async () => {
    const autoNode2 = mkNode({ id: 200, node_order: 2, node_type: 'auto' });
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)   // claim node1
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // finalCheck node1 (无阻塞)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // node1 → approved
      .mockResolvedValueOnce({ rows: [autoNode2] } as any)        // next = auto
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);   // update current_node

    // mock setImmediate 为同步执行，捕获回调
    const origSetImmediate = global.setImmediate;
    const mockSetImmediate = jest.fn((fn: Function) => fn()) as any;
    global.setImmediate = mockSetImmediate;

    // node2 的 executeAutoNodeCallback 需要的 mock
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)   // claim node2
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // finalCheck node2
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)   // node2 → approved
      .mockResolvedValueOnce({ rows: [] } as any)                 // next node (无后续节点)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);   // instance → approved

    const ft = mkFormType();
    await executeAutoNodeCallback(1, mkNode(), ft as any, mkInstance(), {});

    // 验证第一个 auto 节点的 onApproved 被执行（executeAutoNodeCallback 内部递归不会再调用 onApproved）
    expect(ft.onApproved).toHaveBeenCalledTimes(1);

    // 验证 enqueueExecuteAutoNode 被调用（兜底入队）
    expect(enqueueExecuteAutoNode).toHaveBeenCalledWith(1, autoNode2.id);

    // 验证 setImmediate 被调用（立即执行路径）
    expect(mockSetImmediate).toHaveBeenCalled();

    global.setImmediate = origSetImmediate;
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

  it('回调返回 sendBack=true 时跳过后续 mark-approved + advanceToNextNode', async () => {
    const ft = mkFormType({ onApproved: jest.fn().mockResolvedValue({ sendBack: true }) });
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any)   // claim
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);   // finalCheck (无阻塞)
    await executeAutoNodeCallback(1, mkNode(), ft as any, mkInstance(), {});
    expect(ft.onApproved).toHaveBeenCalledTimes(1);
    // 仅 claim + finalCheck 两次查询，不应有 mark-approved 或 advanceToNextNode 的查询
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe('retryAutoNode', () => {
  it('实例不存在时抛出异常', async () => {
    mockTransaction.mockImplementation(async (fn: any) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] } as any) // advisory lock
          .mockResolvedValueOnce({ rows: [] } as any), // SELECT instance
      };
      return fn(client);
    });
    await expect(retryAutoNode(999)).rejects.toThrow('审批实例不存在');
  });

  it('审批已处于终态时抛出异常', async () => {
    mockTransaction.mockImplementation(async (fn: any) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] } as any) // advisory lock
          .mockResolvedValueOnce({ rows: [mkInstance({ status: 'approved' })] } as any), // SELECT instance
      };
      return fn(client);
    });
    await expect(retryAutoNode(1)).rejects.toThrow('审批已处于终态');
  });

  it('未找到需要重试的 auto 节点时抛出异常', async () => {
    mockTransaction.mockImplementation(async (fn: any) => {
      const client = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] } as any) // advisory lock
          .mockResolvedValueOnce({ rows: [mkInstance()] } as any) // SELECT instance
          // 第三个查询：auto 节点查询返回空（没有找到 pending/failed 的 auto 节点）
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
          .mockResolvedValueOnce({ rows: [] } as any)   // advisory lock
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
          .mockResolvedValueOnce({ rows: [] } as any)       // advisory lock
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
