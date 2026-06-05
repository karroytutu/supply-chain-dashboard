/**
 * OA 审批详情查询单元测试
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../form-types', () => ({
  getFormTypeByCode: jest.fn(),
}));

import { appQuery } from '../../../db/appPool';
import { mockQueryResult, mockQuerySequence } from '../../../__tests__/helpers/mockDb';
import { getFormTypeByCode } from '../form-types';
import { getApprovalDetail } from './approval-detail';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetFormTypeByCode = getFormTypeByCode as jest.MockedFunction<typeof getFormTypeByCode>;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getApprovalDetail', () => {
  it('不存在时返回 null', async () => {
    mockAppQuery.mockResolvedValueOnce(mockQueryResult([]));

    const result = await getApprovalDetail(999);
    expect(result).toBeNull();
  });

  it('返回完整审批详情', async () => {
    const instance = {
      id: 1,
      instance_no: 'OA-001',
      form_type_code: 'other_payment',
      form_type_name: '其他付款',
      form_type_icon: 'PayCircleOutlined',
      form_schema: { fields: [{ key: 'amount', label: '金额', type: 'money' }] },
      title: '付款申请',
      status: 'pending',
      applicant_id: 5,
      applicant_name: '张三',
      applicant_dept: '财务部',
      applicant_avatar: null,
      current_node_order: 1,
      submitted_at: new Date('2026-06-01'),
      completed_at: null,
      form_data: { amount: 5000 },
      erp_meta: null,
    };

    const nodes = [
      {
        id: 10, node_order: 1, node_name: '主管审批', node_type: 'role',
        assigned_user_id: 10, assigned_user_name: '李主管', assigned_user_avatar: null,
        status: 'pending', comment: null, acted_at: null, is_countersign: false,
      },
      {
        id: 11, node_order: 2, node_name: '总经理审批', node_type: 'role',
        assigned_user_id: 20, assigned_user_name: '王总', assigned_user_avatar: null,
        status: 'pending', comment: null, acted_at: null, is_countersign: false,
      },
    ];

    const actions = [
      {
        id: 100, action_type: 'submit', operator_id: 5, operator_name: '张三',
        node_order: 1, comment: null, details: null, action_at: new Date('2026-06-01'),
      },
    ];

    const ccUsers = [
      { id: 200, user_id: 30, user_name: '赵六', avatar: null, read_at: null },
    ];

    mockQuerySequence(mockAppQuery, [
      [instance], // instance query
      nodes,      // nodes query
      actions,    // actions query
      ccUsers,    // cc query
    ]);

    const result = await getApprovalDetail(1);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.instanceNo).toBe('OA-001');
    expect(result!.formTypeName).toBe('其他付款');
    expect(result!.title).toBe('付款申请');
    expect(result!.applicantName).toBe('张三');
    expect(result!.nodes).toHaveLength(2);
    expect(result!.nodes[0].nodeName).toBe('主管审批');
    expect(result!.nodes[0].nodeOrder).toBe(1);
    expect(result!.actions).toHaveLength(1);
    expect(result!.ccUsers).toHaveLength(1);
    expect(result!.ccUsers[0].userName).toBe('赵六');
  });

  it('当前节点名称从 nodes 中匹配', async () => {
    const instance = {
      id: 2, instance_no: 'OA-002', form_type_code: 'test',
      form_type_name: '测试', form_type_icon: null, form_schema: null,
      title: '测试', status: 'pending', applicant_id: 1,
      applicant_name: 'A', applicant_dept: null, applicant_avatar: null,
      current_node_order: 2, submitted_at: new Date(), completed_at: null,
      form_data: {}, erp_meta: null,
    };

    mockQuerySequence(mockAppQuery, [
      [instance],
      [
        { id: 10, node_order: 1, node_name: '节点1', status: 'approved' },
        { id: 11, node_order: 2, node_name: '节点2', status: 'pending' },
      ],
      [],
      [],
    ]);

    const result = await getApprovalDetail(2);
    expect(result!.currentNodeName).toBe('节点2');
  });

  it('form_schema 从 form_types 表获取', async () => {
    const instance = {
      id: 3, instance_no: 'OA-003', form_type_code: 'custom',
      form_type_name: '自定义', form_type_icon: null,
      form_schema: { fields: [{ key: 'name', type: 'text' }] },
      title: '自定义', status: 'pending', applicant_id: 1,
      applicant_name: 'A', applicant_dept: null, applicant_avatar: null,
      current_node_order: 1, submitted_at: new Date(), completed_at: null,
      form_data: {}, erp_meta: null,
    };

    mockQuerySequence(mockAppQuery, [[instance], [], [], []]);

    const result = await getApprovalDetail(3);
    expect(result!.formSchema).toEqual({ fields: [{ key: 'name', type: 'text' }] });
  });

  it('form_schema 回退到 formType 定义', async () => {
    const instance = {
      id: 4, instance_no: 'OA-004', form_type_code: 'fallback_form',
      form_type_name: null, form_type_icon: null,
      form_schema: null, // no form_schema from DB
      title: '回退测试', status: 'pending', applicant_id: 1,
      applicant_name: 'A', applicant_dept: null, applicant_avatar: null,
      current_node_order: 1, submitted_at: new Date(), completed_at: null,
      form_data: {}, erp_meta: null,
    };

    (getFormTypeByCode as jest.Mock).mockReturnValue({
      code: 'fallback_form',
      name: '回退表单',
      icon: 'FileTextOutlined',
      formSchema: { fields: [{ key: 'fallback', type: 'text' }] },
    });

    mockQuerySequence(mockAppQuery, [[instance], [], [], []]);

    const result = await getApprovalDetail(4);
    expect(result!.formSchema).toEqual({ fields: [{ key: 'fallback', type: 'text' }] });
    expect(result!.formTypeName).toBe('回退表单');
    expect(result!.formTypeIcon).toBe('FileTextOutlined');
  });

  it('nodes 包含 isCountersign 字段', async () => {
    mockQuerySequence(mockAppQuery, [
      [{ id: 5, instance_no: 'OA-005', form_type_code: 'test', form_type_name: 'T',
         form_type_icon: null, form_schema: null, title: 'T', status: 'pending',
         applicant_id: 1, applicant_name: 'A', applicant_dept: null, applicant_avatar: null,
         current_node_order: 1, submitted_at: new Date(), completed_at: null,
         form_data: {}, erp_meta: null }],
      [{ id: 10, node_order: 1, node_name: '加签节点', node_type: 'role',
         assigned_user_id: 10, assigned_user_name: 'B', assigned_user_avatar: null,
         status: 'pending', comment: null, acted_at: null, is_countersign: true }],
      [],
      [],
    ]);

    const result = await getApprovalDetail(5);
    expect(result!.nodes[0].isCountersign).toBe(true);
  });

  it('actions 包含完整字段', async () => {
    mockQuerySequence(mockAppQuery, [
      [{ id: 6, instance_no: 'OA-006', form_type_code: 'test', form_type_name: 'T',
         form_type_icon: null, form_schema: null, title: 'T', status: 'pending',
         applicant_id: 1, applicant_name: 'A', applicant_dept: null, applicant_avatar: null,
         current_node_order: 1, submitted_at: new Date(), completed_at: null,
         form_data: {}, erp_meta: null }],
      [],
      [{ id: 50, action_type: 'approve', operator_id: 10, operator_name: '审批人',
         node_order: 1, comment: '同意', details: { key: 'val' }, action_at: new Date('2026-06-01') }],
      [],
    ]);

    const result = await getApprovalDetail(6);
    expect(result!.actions[0].actionType).toBe('approve');
    expect(result!.actions[0].operatorName).toBe('审批人');
    expect(result!.actions[0].details).toEqual({ key: 'val' });
  });

  it('返回结果包含 workflowDef 字段', async () => {
    const workflowDef = { nodes: [{ order: 1, name: '节点1', type: 'role' }] };
    const instance = {
      id: 7, instance_no: 'OA-007', form_type_code: 'test', form_type_name: 'T',
      form_type_icon: null, form_schema: null, workflow_def: workflowDef,
      title: 'T', status: 'pending', applicant_id: 1, applicant_name: 'A',
      applicant_dept: null, applicant_avatar: null, current_node_order: 1,
      submitted_at: new Date(), completed_at: null, form_data: {}, erp_meta: null,
    };
    mockQuerySequence(mockAppQuery, [[instance], [], [], []]);
    const result = await getApprovalDetail(7);
    expect(result!.workflowDef).toEqual(workflowDef);
  });

  it('workflowDef 回退到 formType 定义', async () => {
    const instance = {
      id: 8, instance_no: 'OA-008', form_type_code: 'fallback_wf',
      form_type_name: null, form_type_icon: null, form_schema: null,
      workflow_def: null,
      title: 'T', status: 'pending', applicant_id: 1, applicant_name: 'A',
      applicant_dept: null, applicant_avatar: null, current_node_order: 1,
      submitted_at: new Date(), completed_at: null, form_data: {}, erp_meta: null,
    };
    const fallbackWf = { nodes: [{ order: 1, name: 'fallback', type: 'auto' }] };
    (mockGetFormTypeByCode as jest.Mock).mockReturnValue({
      code: 'fallback_wf', name: '回退', icon: null,
      formSchema: { fields: [] },
      workflowDef: fallbackWf,
    });
    mockQuerySequence(mockAppQuery, [[instance], [], [], []]);
    const result = await getApprovalDetail(8);
    expect(result!.workflowDef).toEqual(fallbackWf);
  });

  it('workflowDef 两者都为 null 时返回 null', async () => {
    const instance = {
      id: 9, instance_no: 'OA-009', form_type_code: 'no_wf',
      form_type_name: null, form_type_icon: null, form_schema: null,
      workflow_def: null,
      title: 'T', status: 'pending', applicant_id: 1, applicant_name: 'A',
      applicant_dept: null, applicant_avatar: null, current_node_order: 1,
      submitted_at: new Date(), completed_at: null, form_data: {}, erp_meta: null,
    };
    (mockGetFormTypeByCode as jest.Mock).mockReturnValue({
      code: 'no_wf', name: '无', icon: null,
      formSchema: { fields: [] },
    });
    mockQuerySequence(mockAppQuery, [[instance], [], [], []]);
    const result = await getApprovalDetail(9);
    expect(result!.workflowDef).toBeNull();
  });

  it('nodes 包含 roleCode 字段', async () => {
    const instance = {
      id: 10, instance_no: 'OA-010', form_type_code: 'test',
      form_type_name: 'T', form_type_icon: null, form_schema: null,
      workflow_def: null,
      title: 'T', status: 'pending', applicant_id: 1, applicant_name: 'A',
      applicant_dept: null, applicant_avatar: null, current_node_order: 1,
      submitted_at: new Date(), completed_at: null, form_data: {}, erp_meta: null,
    };
    const nodes = [
      { id: 20, node_order: 1, node_name: '营销师', node_type: 'role',
        role_code: 'marketer', assigned_user_id: 10, assigned_user_name: '张三',
        assigned_user_avatar: null, status: 'pending', comment: null, acted_at: null,
        is_countersign: false },
    ];
    mockQuerySequence(mockAppQuery, [[instance], nodes, [], []]);
    const result = await getApprovalDetail(10);
    expect(result!.nodes[0].roleCode).toBe('marketer');
  });

  it('roleCode 为 null 时返回 null', async () => {
    const instance = {
      id: 11, instance_no: 'OA-011', form_type_code: 'test',
      form_type_name: 'T', form_type_icon: null, form_schema: null,
      workflow_def: null,
      title: 'T', status: 'pending', applicant_id: 1, applicant_name: 'A',
      applicant_dept: null, applicant_avatar: null, current_node_order: 1,
      submitted_at: new Date(), completed_at: null, form_data: {}, erp_meta: null,
    };
    const nodes = [
      { id: 30, node_order: 1, node_name: '自动节点', node_type: 'auto',
        role_code: null, assigned_user_id: null, assigned_user_name: null,
        assigned_user_avatar: null, status: 'pending', comment: null, acted_at: null,
        is_countersign: false },
    ];
    mockQuerySequence(mockAppQuery, [[instance], nodes, [], []]);
    const result = await getApprovalDetail(11);
    expect(result!.nodes[0].roleCode).toBeNull();
  });
});
