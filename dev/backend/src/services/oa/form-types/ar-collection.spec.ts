/**
 * 催收表单类型定义 测试
 * @module services/oa/form-types/ar-collection.spec
 */

jest.mock('../ar-collection-callback', () => ({
  beforeSubmitArCollection: jest.fn(),
  onApprovedArCollection: jest.fn(),
}));

import {
  COLLECTION_ACTIONS,
  LEVEL_ACTION_OPTIONS,
  ESCALATION_ROLES,
  arCollectionFormType,
} from './ar-collection';

// =====================================================
// 常量验证
// =====================================================

describe('COLLECTION_ACTIONS', () => {
  it('包含全部 7 种操作', () => {
    expect(COLLECTION_ACTIONS.VERIFY).toBe('verify');
    expect(COLLECTION_ACTIONS.EXTENSION).toBe('extension');
    expect(COLLECTION_ACTIONS.DIFFERENCE).toBe('difference');
    expect(COLLECTION_ACTIONS.ESCALATE).toBe('escalate');
    expect(COLLECTION_ACTIONS.RESOLVE_DIFF).toBe('resolve_diff');
    expect(COLLECTION_ACTIONS.SEND_LETTER).toBe('send_letter');
    expect(COLLECTION_ACTIONS.LAWSUIT).toBe('lawsuit');
  });

  it('值均为非空字符串', () => {
    Object.values(COLLECTION_ACTIONS).forEach((val) => {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    });
  });
});

describe('LEVEL_ACTION_OPTIONS', () => {
  it('L0 包含 verify/extension/difference/escalate', () => {
    expect(LEVEL_ACTION_OPTIONS[0]).toEqual(
      expect.arrayContaining(['verify', 'extension', 'difference', 'escalate'])
    );
    expect(LEVEL_ACTION_OPTIONS[0]).toHaveLength(4);
  });

  it('L1 与 L0 选项相同', () => {
    expect(LEVEL_ACTION_OPTIONS[1]).toEqual(LEVEL_ACTION_OPTIONS[0]);
  });

  it('L2 包含 verify/extension/resolve_diff/send_letter/lawsuit', () => {
    expect(LEVEL_ACTION_OPTIONS[2]).toEqual(
      expect.arrayContaining(['verify', 'extension', 'resolve_diff', 'send_letter', 'lawsuit'])
    );
    expect(LEVEL_ACTION_OPTIONS[2]).toHaveLength(5);
    expect(LEVEL_ACTION_OPTIONS[2]).not.toContain('escalate');
    expect(LEVEL_ACTION_OPTIONS[2]).not.toContain('difference');
  });
});

describe('ESCALATION_ROLES', () => {
  it('L1 → marketing_manager', () => {
    expect(ESCALATION_ROLES[1]).toBe('marketing_manager');
  });

  it('L2 → current_accountant', () => {
    expect(ESCALATION_ROLES[2]).toBe('current_accountant');
  });

  it('L0 不在映射中', () => {
    expect(ESCALATION_ROLES[0]).toBeUndefined();
  });
});

// =====================================================
// arCollectionFormType 完整定义
// =====================================================

describe('arCollectionFormType', () => {
  it('基本属性正确', () => {
    expect(arCollectionFormType.code).toBe('ar_collection');
    expect(arCollectionFormType.name).toBe('逾期催收');
    expect(arCollectionFormType.category).toBe('supply_chain');
    expect(arCollectionFormType.version).toBe(1);
  });

  it('formSchema 字段数量正确', () => {
    // 6 只读展示(consumerName/totalAmount/billCount/maxOverdueDays/managerName/billDetails)
    // + 1 隐藏(_extensionCount)
    // + 10 操作区(action/verifyRemark/extensionDays/extensionReason/guarantorSignature/differenceRemark/escalateReason/resolveDiffRemark/letterAttachment/deliveryProof)
    // = 17
    expect(arCollectionFormType.formSchema.fields).toHaveLength(17);
  });

  it('workflowDef 包含 2 个初始节点', () => {
    expect(arCollectionFormType.workflowDef.nodes).toHaveLength(2);
  });

  it('第一个节点为 operation 类型', () => {
    const firstNode = arCollectionFormType.workflowDef.nodes[0];
    expect(firstNode.name).toBe('营销师催收');
    expect(firstNode.interactionType).toBe('operation');
    expect(firstNode.roleCode).toBe('marketer');
  });

  it('第二个节点为 auto 类型', () => {
    const secondNode = arCollectionFormType.workflowDef.nodes[1];
    expect(secondNode.name).toBe('更新催收状态');
    expect(secondNode.type).toBe('auto');
  });

  it('beforeSubmit 回调已绑定', () => {
    expect(typeof arCollectionFormType.beforeSubmit).toBe('function');
  });

  it('onApproved 回调已绑定', () => {
    expect(typeof arCollectionFormType.onApproved).toBe('function');
  });
});

// =====================================================
// formSchema 字段结构
// =====================================================

describe('formSchema 字段结构', () => {
  const fields = arCollectionFormType.formSchema.fields;
  const findField = (key: string) => fields.find((f) => f.key === key);

  it('consumerName 为 text + disabled', () => {
    const field = findField('consumerName');
    expect(field).toBeDefined();
    expect(field!.type).toBe('text');
    expect(field!.disabled).toBe(true);
  });

  it('totalAmount 为 money + upper', () => {
    const field = findField('totalAmount');
    expect(field).toBeDefined();
    expect(field!.type).toBe('money');
    expect(field!.upper).toBe(true);
  });

  it('billDetails 为 table + 5 个子字段', () => {
    const field = findField('billDetails');
    expect(field).toBeDefined();
    expect(field!.type).toBe('table');
    expect(field!.children).toHaveLength(5);
    const childKeys = field!.children!.map((c) => c.key);
    expect(childKeys).toEqual(['billNo', 'billType', 'totalAmount', 'leftAmount', 'overdueDays']);
  });

  it('action 为 select + 7 个选项', () => {
    const field = findField('action');
    expect(field).toBeDefined();
    expect(field!.type).toBe('select');
    expect(field!.options).toHaveLength(7);
  });

  it('extensionDays 有 visibleWhen 和 requiredWhen', () => {
    const field = findField('extensionDays');
    expect(field).toBeDefined();
    expect(field!.visibleWhen).toEqual({ field: 'action', operator: '==', value: 'extension' });
    expect((field as any).requiredWhen).toEqual({ field: 'action', operator: '==', value: 'extension' });
  });

  it('guarantorSignature 类型为 signature', () => {
    const field = findField('guarantorSignature');
    expect(field).toBeDefined();
    expect(field!.type).toBe('signature');
  });

  it('_extensionCount 为隐藏数字字段', () => {
    const field = findField('_extensionCount');
    expect(field).toBeDefined();
    expect(field!.type).toBe('number');
  });
});
