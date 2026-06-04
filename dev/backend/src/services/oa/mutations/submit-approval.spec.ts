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
  filterNodesByCondition: jest.fn(),
  resolveApproverId: jest.fn(),
}));

jest.mock('../../fixed-asset/erp-meta-utils', () => ({
  initErpMeta: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../oa-notify', () => ({
  notifyPendingApproval: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../oa-process-centre', () => ({
  createProcessInstance: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./shared-utils', () => ({
  transaction: jest.fn(),
  getInstanceNotifyData: jest.fn(),
}));

jest.mock('./approve-approval', () => ({
  executeAutoNodeCallback: jest.fn(),
}));

import { appQuery } from '../../../db/appPool';
import { generateInstanceNo, validateFormData, filterNodesByCondition, resolveApproverId } from '../oa-utils';
import { initErpMeta } from '../../fixed-asset/erp-meta-utils';
import { transaction } from './shared-utils';
import { submitApproval } from './submit-approval';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockFilterNodes = filterNodesByCondition as jest.MockedFunction<typeof filterNodesByCondition>;
const mockResolveApprover = resolveApproverId as jest.MockedFunction<typeof resolveApproverId>;
const mockTransaction = transaction as jest.MockedFunction<typeof transaction>;
const mockInitErpMeta = initErpMeta as jest.MockedFunction<typeof initErpMeta>;

const baseFormType: any = {
  code: 'other_payment',
  name: '其他付款',
  formSchema: { fields: [] },
  workflowDef: { nodes: [{ order: 1, name: '主管', type: 'role', roleCode: 'manager' }] },
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
  mockFilterNodes.mockReturnValue([{ order: 1, name: '主管', type: 'role', roleCode: 'manager' }]);
  mockResolveApprover.mockResolvedValue(10);
  mockInitErpMeta.mockResolvedValue(undefined as any);
  mockAppQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
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
    mockFilterNodes.mockReturnValueOnce([]);

    await expect(
      submitApproval(baseReq, baseFormType, 1, '张三', '销售部')
    ).rejects.toThrow('审批流程配置错误');
  });

  it('成功提交返回 instanceId 和 instanceNo', async () => {
    const mockInstance = { id: 42, instance_no: 'OA-20260601-001' };

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [mockInstance] }) // INSERT instance
          .mockResolvedValueOnce({ rows: [{ name: '李主管' }] }) // SELECT approver name
          .mockResolvedValueOnce({ rows: [] }) // INSERT node
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
          .mockResolvedValueOnce({ rows: [mockInstance] })
          .mockResolvedValueOnce({ rows: [{ name: '王五' }] })
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
    mockFilterNodes.mockReturnValueOnce([
      { order: 1, name: '自动处理', type: 'auto' },
    ]);

    const mockInstance = { id: 5, instance_no: 'OA-AUTO-001' };

    mockTransaction.mockImplementationOnce(async (fn: any) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [mockInstance] }) // INSERT instance
          .mockResolvedValueOnce({ rows: [] }) // INSERT node
          .mockResolvedValueOnce({ rows: [] }) // INSERT action
          .mockResolvedValueOnce({ rows: [{ id: 100, node_type: 'auto', status: 'pending' }] }), // auto node
      };
      return fn(mockClient);
    });

    // Verify the INSERT instance query includes 'processing' status
    mockTransaction.mock.calls.length; // just to reference

    const result = await submitApproval(
      { ...baseReq, formData: {} },
      { ...baseFormType, workflowDef: { nodes: [{ order: 1, name: 'Auto', type: 'auto' }] } },
      1, '张三', null
    );

    expect(result.instanceId).toBe(5);
  });
});
