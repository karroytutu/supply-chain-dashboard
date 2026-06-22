/**
 * 催收表单类型定义 测试
 * @module services/oa/form-types/ar-collection.spec
 */

jest.mock('../ar-collection-callback', () => ({
  beforeSubmitArCollection: jest.fn(),
  handleArCollectionAutoVerify: jest.fn(),
}));

import {
  COLLECTION_ACTIONS,
  LEVEL_ACTION_OPTIONS,
  ESCALATION_ROLES,
  arCollectionFormType,
} from './ar-collection';
import { filterNodesByCondition } from '../oa-workflow-utils';

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
    expect(arCollectionFormType.version).toBe(4);
  });

  it('formSchema 字段数量正确', () => {
    // 8 只读展示 + 10 营销师操作区 + 7 经理操作区 + 7 会计操作区 = 32
    expect(arCollectionFormType.formSchema.fields).toHaveLength(32);
  });

  it('workflowDef 包含 7 个预定义环节', () => {
    expect(arCollectionFormType.workflowDef.nodes).toHaveLength(7);
  });

  it('第一个节点为营销师催收（handle类型，无 reActivatable）', () => {
    const firstNode = arCollectionFormType.workflowDef.nodes[0];
    expect(firstNode.name).toBe('营销师催收');
    expect(firstNode.handler?.roleCode).toBe('marketer');
    expect(firstNode.type).toBe('handle');
    expect(firstNode.signMode).toBe('or');
    expect(firstNode.fieldPermissions).toBeDefined();
    expect(firstNode.fieldOptionFilter).toBeDefined();
    // reActivatable 已移除：循环退回由 onApproved 回调直接处理，无需条件重评估机制
    expect((firstNode as any).reActivatable).toBeUndefined();
  });

  it('第二个节点为营销经理催收（条件节点，action==escalate）', () => {
    const node = arCollectionFormType.workflowDef.nodes[1];
    expect(node.name).toBe('营销经理催收');
    expect(node.handler?.roleCode).toBe('marketing_manager');
    expect(node.type).toBe('handle');
    expect(node.fieldPermissions).toBeDefined();
    expect(node.condition).toEqual({ field: 'action', operator: '==', value: 'escalate' });
    expect(node.fieldOptionFilter).toEqual({ mgrAction: LEVEL_ACTION_OPTIONS[1] });
  });

  it('第三个节点为往来会计催收（条件节点，mgrAction==escalate）', () => {
    const node = arCollectionFormType.workflowDef.nodes[2];
    expect(node.name).toBe('往来会计催收');
    expect(node.handler?.roleCode).toBe('current_accountant');
    expect(node.type).toBe('handle');
    expect(node.condition).toEqual({ field: 'mgrAction', operator: '==', value: 'escalate' });
    expect(node.fieldOptionFilter).toEqual({ accAction: LEVEL_ACTION_OPTIONS[2] });
  });

  it('第四个节点为财务差异处理（OR 条件：营销师或会计的差异操作）', () => {
    const node = arCollectionFormType.workflowDef.nodes[3];
    expect(node.name).toBe('财务差异处理');
    expect(node.handler?.roleCode).toBe('current_accountant');
    expect(node.type).toBe('handle');
    expect(node.condition).toEqual({
      match: 'any',
      conditions: [
        { field: 'action', operator: '==', value: 'difference' },
        { field: 'accAction', operator: '==', value: 'difference' },
      ],
    });
  });

  it('第五个节点为起诉立案（单条件：会计的起诉操作）', () => {
    const node = arCollectionFormType.workflowDef.nodes[4];
    expect(node.name).toBe('起诉立案');
    expect(node.type).toBe('handle');
    expect(node.condition).toEqual({ field: 'accAction', operator: '==', value: 'lawsuit' });
  });

  it('第六个节点为总经理审批延期（OR 条件：经理或会计的延期操作）', () => {
    const node = arCollectionFormType.workflowDef.nodes[5];
    expect(node.name).toBe('总经理审批延期');
    expect(node.handler?.roleCode).toBe('general_manager');
    expect(node.type).toBe('approval');
    expect(node.condition).toEqual({
      match: 'any',
      conditions: [
        { field: 'mgrAction', operator: '==', value: 'extension' },
        { field: 'accAction', operator: '==', value: 'extension' },
      ],
    });
  });

  it('第七个节点为核销校验（auto类型）', () => {
    const node = arCollectionFormType.workflowDef.nodes[6];
    expect(node.name).toBe('核销校验');
    expect(node.type).toBe('auto');
  });

  it('beforeSubmit 回调已绑定', () => {
    expect(typeof arCollectionFormType.beforeSubmit).toBe('function');
  });

  it('onApproved 回调已绑定（核销校验 + 即时退回循环催收）', () => {
    expect(arCollectionFormType.onApproved).toBeDefined();
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

  it('billDetails 为 table + 8 个子字段（billNo 已隐藏）', () => {
    const field = findField('billDetails');
    expect(field).toBeDefined();
    expect(field!.type).toBe('table');
    expect(field!.children).toHaveLength(9);
    const childKeys = field!.children!.map((c) => c.key);
    expect(childKeys).toEqual(['orderNo', 'workTime', 'billType', 'totalAmount', 'writeOffAmount', 'leftAmount', 'overdueDays', 'billNote', 'verifyStatus']);
    // billNo 不应出现在展示列中（保留在 formData 中用于核销校验）
    expect(childKeys).not.toContain('billNo');
  });

  it('action 为 select + 7 个选项', () => {
    const field = findField('action');
    expect(field).toBeDefined();
    expect(field!.type).toBe('select');
    expect(field!.options).toHaveLength(7);
  });

  it('extensionDays 有 visibleWhen（无 requiredWhen，由 required+visibleWhen+fieldPermissions 联动校验）', () => {
    const field = findField('extensionDays');
    expect(field).toBeDefined();
    expect(field!.visibleWhen).toEqual({ field: 'action', operator: '==', value: 'extension' });
    expect((field as any).requiredWhen).toBeUndefined();
  });

  it('guarantorSignature 类型为 signature + required + visibleWhen', () => {
    const field = findField('guarantorSignature');
    expect(field).toBeDefined();
    expect(field!.type).toBe('signature');
    expect(field!.required).toBe(true);
    expect(field!.visibleWhen).toEqual({ field: 'action', operator: '==', value: 'extension' });
  });

  it('_extensionCount 已移除（业务规则简化，不再需要延期次数计数）', () => {
    const field = findField('_extensionCount');
    expect(field).toBeUndefined();
  });

  it('maxDebtDays 为 number + disabled + suffix天', () => {
    const field = findField('maxDebtDays');
    expect(field).toBeDefined();
    expect(field!.type).toBe('number');
    expect(field!.disabled).toBe(true);
    expect(field!.suffix).toBe('天');
  });

  it('maxDebtOrderNum 为 number + disabled', () => {
    const field = findField('maxDebtOrderNum');
    expect(field).toBeDefined();
    expect(field!.type).toBe('number');
    expect(field!.disabled).toBe(true);
  });

  // === 营销经理(marketing_manager)操作字段 ===
  it('mgrAction 为 select + 4 个选项', () => {
    const field = findField('mgrAction');
    expect(field).toBeDefined();
    expect(field!.type).toBe('select');
    expect(field!.options).toHaveLength(4);
    expect(field!.options!.map(o => o.value)).toEqual(['verify', 'extension', 'difference', 'escalate']);
  });

  it('mgrExtensionDays 有 visibleWhen 引用 mgrAction', () => {
    const field = findField('mgrExtensionDays');
    expect(field).toBeDefined();
    expect(field!.visibleWhen).toEqual({ field: 'mgrAction', operator: '==', value: 'extension' });
    expect(field!.required).toBe(true);
  });

  it('mgrEscalateReason 有 visibleWhen 引用 mgrAction', () => {
    const field = findField('mgrEscalateReason');
    expect(field).toBeDefined();
    expect(field!.visibleWhen).toEqual({ field: 'mgrAction', operator: '==', value: 'escalate' });
  });

  // === 往来会计(current_accountant)操作字段 ===
  it('accAction 为 select + 5 个选项', () => {
    const field = findField('accAction');
    expect(field).toBeDefined();
    expect(field!.type).toBe('select');
    expect(field!.options).toHaveLength(5);
    expect(field!.options!.map(o => o.value)).toEqual(['verify', 'extension', 'resolve_diff', 'send_letter', 'lawsuit']);
  });

  it('accLetterAttachment 有 visibleWhen 引用 accAction', () => {
    const field = findField('accLetterAttachment');
    expect(field).toBeDefined();
    expect(field!.visibleWhen).toEqual({ field: 'accAction', operator: '==', value: 'send_letter' });
  });
});

// =====================================================
// 按环节字段权限
// =====================================================

describe('按环节字段权限', () => {
  const nodes = arCollectionFormType.workflowDef.nodes;

  it('营销师(marketer)环节：营销师字段可编辑，经理/会计字段隐藏', () => {
    const perms = nodes[0].fieldPermissions!;
    expect(perms['action']).toBe('editable');
    expect(perms['verifyRemark']).toBe('editable');
    expect(perms['mgrAction']).toBe('hidden');
    expect(perms['accAction']).toBe('hidden');
  });

  it('营销经理(marketing_manager)环节：营销师字段只读，经理字段可编辑，会计字段隐藏', () => {
    const perms = nodes[1].fieldPermissions!;
    expect(perms['action']).toBe('readonly');
    expect(perms['escalateReason']).toBe('readonly');
    expect(perms['mgrAction']).toBe('editable');
    expect(perms['mgrEscalateReason']).toBe('editable');
    expect(perms['accAction']).toBe('hidden');
  });

  it('往来会计(current_accountant)环节：营销师/经理字段只读，会计字段可编辑', () => {
    const perms = nodes[2].fieldPermissions!;
    expect(perms['action']).toBe('readonly');
    expect(perms['mgrAction']).toBe('readonly');
    expect(perms['accAction']).toBe('editable');
    expect(perms['accLetterAttachment']).toBe('editable');
  });
});

// =====================================================
// 条件触发集成测试
// =====================================================

describe('条件触发集成测试', () => {
  const nodes = arCollectionFormType.workflowDef.nodes;

  it('营销师选择升级 + 经理选择升级 + 会计选择起诉 → 触发起诉立案', () => {
    const formData = {
      action: 'escalate',
      mgrAction: 'escalate',
      accAction: 'lawsuit',
    };
    const visible = filterNodesByCondition(nodes, formData);
    const names = visible.map(n => n.name);
    expect(names).toContain('营销师催收');
    expect(names).toContain('营销经理催收');
    expect(names).toContain('往来会计催收');
    expect(names).toContain('起诉立案');
    expect(names).not.toContain('财务差异处理');
    expect(names).not.toContain('总经理审批延期');
  });

  it('营销师选择差异 → 触发财务差异处理（OR 条件，营销师路径）', () => {
    const formData = { action: 'difference' };
    const visible = filterNodesByCondition(nodes, formData);
    const names = visible.map(n => n.name);
    expect(names).toContain('财务差异处理');
    expect(names).not.toContain('起诉立案');
  });

  it('会计选择差异 → 触发财务差异处理（OR 条件，会计路径）', () => {
    const formData = { action: 'escalate', mgrAction: 'escalate', accAction: 'difference' };
    const visible = filterNodesByCondition(nodes, formData);
    const names = visible.map(n => n.name);
    expect(names).toContain('财务差异处理');
  });

  it('经理选择延期 → 触发总经理审批延期（OR 条件，经理路径）', () => {
    const formData = { action: 'escalate', mgrAction: 'extension' };
    const visible = filterNodesByCondition(nodes, formData);
    const names = visible.map(n => n.name);
    expect(names).toContain('总经理审批延期');
  });

  it('无任何操作字段 → 仅营销师催收 + 核销校验未触发', () => {
    const formData = {};
    const visible = filterNodesByCondition(nodes, formData);
    const names = visible.map(n => n.name);
    expect(names).toContain('营销师催收');
    expect(names).not.toContain('营销经理催收');
    expect(names).not.toContain('往来会计催收');
    expect(names).not.toContain('起诉立案');
    expect(names).not.toContain('财务差异处理');
    expect(names).not.toContain('总经理审批延期');
  });
});
