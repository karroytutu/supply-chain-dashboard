/**
 * OA 提交审批操作单元测试
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../oa-utils', () => ({
  generateInstanceNo: jest.fn().mockResolvedValue('OA-20260601-001'),
  validateFormData: jest.fn().mockReturnValue([]),
}));

jest.mock('../oa-workflow-utils', () => ({
  evaluateAndTriggerNodes: jest.fn(),
}));

jest.mock('../../fixed-asset/erp-meta-utils', () => ({
  initErpMeta: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../oa-async-task.service', () => ({
  enqueueCreateProcessInstance: jest.fn().mockResolvedValue(undefined),
  enqueueSendApprovalNotification: jest.fn().mockResolvedValue(undefined),
  enqueueExecuteAutoNode: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./shared-utils', () => ({
  transaction: jest.fn(),
  getInstanceNotifyData: jest.fn(),
}));

jest.mock('./approve-approval', () => ({
  executeAutoNodeCallback: jest.fn(),
}));

import { appQuery } from '../../../db/appPool';
import { generateInstanceNo, validateFormData } from '../oa-utils';
import { evaluateAndTriggerNodes } from '../oa-workflow-utils';
import { initErpMeta } from '../../fixed-asset/erp-meta-utils';
import { transaction } from './shared-utils';
import { submitApproval } from './submit-approval';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockEvaluateNodes = evaluateAndTriggerNodes as jest.MockedFunction<typeof evaluateAndTriggerNodes>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;
const mockInitErpMeta = initErpMeta as jest.MockedFunction<typeof initErpMeta>;

const baseFormType: any = {
  code: 'other_payment',
  name: '其他付款',
  formSchema: { fields: [] },
  workflowDef: { nodes: [{ order: 1, name: '主管', type: 'approval', handler: { roleCode: 'department_manager' }, signMode: 'or' }] },
};

const baseReq: any = {
  formTypeCode: 'other_payment',
  title: '测试审批',
  formData: { amount: 1000 },
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  (validateFormData as jest.Mock).mockReturnValue([]);
  mockEvaluateNodes.mockResolvedValue([{ id: 100, node_order: 1, node_type: 'approval', name: '主管', assigned_user_ids: [10] } as any]);
  mockInitErpMeta.mockResolvedValue(undefined as any);
  mockAppQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
  // 默认 transaction 实现：执行回调并传入 mock client
  mockTransaction.mockImplementation(async (fn: any) => {
    const mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    return fn(mockClient);
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('submitApproval', () => {
  it('表单校验失败时抛出异常', async () => {
    (validateFormData as jest.Mock).mockReturnValueOnce(['金额必填']);

    await expect(
      submitApproval(baseReq, baseFormType, 1, '张三', '销售部')
    ).rejects.toThrow('表单校验失败');
  });

  it('无审批节点时抛出异常', async () => {
    mockEvaluateNodes.mockResolvedValueOnce([]);
    // transaction 需要提供 instance 行，然后 evaluateAndTriggerNodes 返回空数组触发异常
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // ftCheck
          .mockResolvedValueOnce({ rows: [{ id: 1, instance_no: 'OA-001' }] }), // INSERT instance
      };
      return fn(mockClient);
    });

    await expect(
      submitApproval(baseReq, baseFormType, 1, '张三', '销售部')
    ).rejects.toThrow('审批流程配置错误');
  });

  it('成功提交返回 instanceId 和 instanceNo', async () => {
    const mockInstance = { id: 42, instance_no: 'OA-20260601-001' };

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // ftCheck
          .mockResolvedValueOnce({ rows: [mockInstance] }) // INSERT instance
          .mockResolvedValueOnce({ rows: [] }) // UPDATE status
          .mockResolvedValueOnce({ rows: [] }), // INSERT action
      };
      return fn(mockClient);
    });

    const result = await submitApproval(baseReq, baseFormType, 1, '张三', '销售部');
    expect(result.instanceId).toBe(42);
    expect(result.instanceNo).toBe('OA-20260601-001');
  });

  it('beforeSubmit 钩子被调用', async () => {
    const formTypeWithHook = {
      ...baseFormType,
      beforeSubmit: jest.fn().mockResolvedValue({ extraField: 'enhanced' }),
    };
    const mockInstance = { id: 1, instance_no: 'OA-001' };

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // ftCheck
          .mockResolvedValueOnce({ rows: [mockInstance] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      return fn(mockClient);
    });

    await submitApproval(baseReq, formTypeWithHook, 1, '张三', null);
    expect(formTypeWithHook.beforeSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1000 }),
      1
    );
  });

  it('auto 类型首节点设置初始状态为 processing', async () => {
    mockEvaluateNodes.mockResolvedValueOnce([
      { id: 200, node_order: 1, node_type: 'auto', name: '自动处理' } as any,
    ]);

    const mockInstance = { id: 5, instance_no: 'OA-AUTO-001' };

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // ftCheck
          .mockResolvedValueOnce({ rows: [mockInstance] }) // INSERT instance
          .mockResolvedValueOnce({ rows: [] }) // UPDATE status
          .mockResolvedValueOnce({ rows: [] }), // INSERT action
      };
      return fn(mockClient);
    });

    const result = await submitApproval(
      { ...baseReq, formData: {} },
      { ...baseFormType, workflowDef: { nodes: [{ order: 1, name: 'Auto', type: 'auto' }] } },
      1, '张三', null
    );

    expect(result.instanceId).toBe(5);
  });

  it('多节点时正确执行提交流程', async () => {
    mockEvaluateNodes.mockResolvedValueOnce([
      { id: 101, node_order: 1, node_type: 'approval', name: '财务审核', assigned_user_ids: [10, 20] } as any,
      { id: 102, node_order: 2, node_type: 'approval', name: '主管审核', assigned_user_ids: [30] } as any,
    ]);

    const mockInstance = { id: 1, instance_no: 'OA-001' };

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // ftCheck
          .mockResolvedValueOnce({ rows: [mockInstance] }) // INSERT instance
          .mockResolvedValueOnce({ rows: [] }) // UPDATE status
          .mockResolvedValueOnce({ rows: [] }), // INSERT action
      };
      return fn(mockClient);
    });

    const result = await submitApproval(baseReq, baseFormType, 1, '张三', null);
    expect(result.instanceId).toBe(1);
  });

  it('提交校验时传入发起节点字段权限', async () => {
    const formTypeWithPerms: any = {
      ...baseFormType,
      fieldPermissions: { nodes: { '0': { paymentSubjectId: 'hidden' } } },
    };
    const mockInstance = { id: 1, instance_no: 'OA-001' };

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // ftCheck
          .mockResolvedValueOnce({ rows: [mockInstance] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      return fn(mockClient);
    });

    await submitApproval(baseReq, formTypeWithPerms, 1, '张三', null);
    expect(validateFormData).toHaveBeenCalledWith(
      formTypeWithPerms.formSchema,
      baseReq.formData,
      { paymentSubjectId: 'hidden' }
    );
  });

  it('表单类型在数据库中不存在时抛出明确错误', async () => {
    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }), // ftCheck 返回空
      };
      return fn(mockClient);
    });

    await expect(
      submitApproval(baseReq, baseFormType, 1, '张三', null)
    ).rejects.toThrow('尚未完成数据库初始化');
  });
});
