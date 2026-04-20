/**
 * oa-approval-utils 条件逻辑单元测试
 * 测试 checkCondition、validateFormData、filterNodesByCondition
 */

import { checkCondition, validateFormData, filterNodesByCondition } from './oa-approval-utils';
import type { FormSchema, WorkflowNodeDef, ConditionDef } from './oa-approval.types';

// =====================================================
// checkCondition 测试
// =====================================================

describe('checkCondition', () => {
  describe('单个条件', () => {
    it('运算符 == 匹配字符串值', () => {
      const condition: ConditionDef = { field: 'hasIncome', operator: '==', value: 'true' };
      expect(checkCondition(condition, { hasIncome: 'true' })).toBe(true);
      expect(checkCondition(condition, { hasIncome: 'false' })).toBe(false);
    });

    it('运算符 == 匹配数字值', () => {
      const condition: ConditionDef = { field: 'status', operator: '==', value: 1 };
      expect(checkCondition(condition, { status: 1 })).toBe(true);
      expect(checkCondition(condition, { status: 0 })).toBe(false);
    });

    it('运算符 > 比较数值', () => {
      const condition: ConditionDef = { field: 'amount', operator: '>', value: 100 };
      expect(checkCondition(condition, { amount: 150 })).toBe(true);
      expect(checkCondition(condition, { amount: 100 })).toBe(false);
      expect(checkCondition(condition, { amount: 50 })).toBe(false);
    });

    it('运算符 < 比较数值', () => {
      const condition: ConditionDef = { field: 'amount', operator: '<', value: 100 };
      expect(checkCondition(condition, { amount: 50 })).toBe(true);
      expect(checkCondition(condition, { amount: 100 })).toBe(false);
    });

    it('运算符 >= 比较数值', () => {
      const condition: ConditionDef = { field: 'estimatedCost', operator: '>=', value: 500 };
      expect(checkCondition(condition, { estimatedCost: 500 })).toBe(true);
      expect(checkCondition(condition, { estimatedCost: 600 })).toBe(true);
      expect(checkCondition(condition, { estimatedCost: 499 })).toBe(false);
    });

    it('运算符 <= 比较数值', () => {
      const condition: ConditionDef = { field: 'count', operator: '<=', value: 10 };
      expect(checkCondition(condition, { count: 10 })).toBe(true);
      expect(checkCondition(condition, { count: 5 })).toBe(true);
      expect(checkCondition(condition, { count: 11 })).toBe(false);
    });

    it('字段值不存在时返回 false', () => {
      const condition: ConditionDef = { field: 'missing', operator: '==', value: 'test' };
      expect(checkCondition(condition, {})).toBe(false);
    });

    it('字段值为 null 时返回 false', () => {
      const condition: ConditionDef = { field: 'field', operator: '==', value: 'test' };
      expect(checkCondition(condition, { field: null })).toBe(false);
    });

    it('未知运算符返回 false', () => {
      const condition = { field: 'a', operator: '!=' as '>', value: 1 };
      expect(checkCondition(condition, { a: 1 })).toBe(false);
    });

    it('字符串数字的 == 比较', () => {
      const condition: ConditionDef = { field: 'amount', operator: '==', value: 100 };
      expect(checkCondition(condition, { amount: '100' })).toBe(true);
    });
  });

  describe('AND 条件数组', () => {
    it('所有条件满足时返回 true', () => {
      const conditions: ConditionDef[] = [
        { field: 'a', operator: '>', value: 0 },
        { field: 'b', operator: '==', value: 'yes' },
      ];
      expect(checkCondition(conditions, { a: 1, b: 'yes' })).toBe(true);
    });

    it('任一条件不满足时返回 false', () => {
      const conditions: ConditionDef[] = [
        { field: 'a', operator: '>', value: 0 },
        { field: 'b', operator: '==', value: 'yes' },
      ];
      expect(checkCondition(conditions, { a: 1, b: 'no' })).toBe(false);
      expect(checkCondition(conditions, { a: -1, b: 'yes' })).toBe(false);
    });

    it('空数组返回 true（every 的默认行为）', () => {
      expect(checkCondition([], {})).toBe(true);
    });
  });
});

// =====================================================
// validateFormData 测试
// =====================================================

describe('validateFormData', () => {
  describe('基本必填校验', () => {
    const schema: FormSchema = {
      fields: [
        { key: 'name', label: '名称', type: 'text', required: true },
        { key: 'amount', label: '金额', type: 'money', required: true },
      ],
    };

    it('所有必填字段都有值时通过', () => {
      expect(validateFormData(schema, { name: '测试', amount: 100 })).toEqual([]);
    });

    it('必填字段缺失时报错', () => {
      const errors = validateFormData(schema, { name: '' });
      expect(errors).toContain('金额不能为空');
    });

    it('必填字段为 undefined 时报错', () => {
      const errors = validateFormData(schema, {});
      expect(errors).toContain('名称不能为空');
      expect(errors).toContain('金额不能为空');
    });

    it('可选字段缺失不报错', () => {
      const optionalSchema: FormSchema = {
        fields: [
          { key: 'name', label: '名称', type: 'text', required: false },
        ],
      };
      expect(validateFormData(optionalSchema, {})).toEqual([]);
    });
  });

  describe('visibleWhen 条件隐藏', () => {
    const schema: FormSchema = {
      fields: [
        { key: 'hasIncome', label: '是否产生收入', type: 'select', required: true,
          options: [{ value: 'true', label: '是' }, { value: 'false', label: '否' }] },
        { key: 'disposalValue', label: '处置收入', type: 'money', required: false,
          visibleWhen: { field: 'hasIncome', operator: '==', value: 'true' },
          requiredWhen: { field: 'hasIncome', operator: '==', value: 'true' } },
      ],
    };

    it('visibleWhen 不满足时跳过校验', () => {
      const errors = validateFormData(schema, { hasIncome: 'false' });
      expect(errors).toEqual([]);
    });

    it('visibleWhen 满足且 requiredWhen 满足时，字段缺失报错', () => {
      const errors = validateFormData(schema, { hasIncome: 'true' });
      expect(errors).toContain('处置收入不能为空');
    });

    it('visibleWhen 满足且有值时通过', () => {
      const errors = validateFormData(schema, { hasIncome: 'true', disposalValue: 5000 });
      expect(errors).toEqual([]);
    });
  });

  describe('requiredWhen 条件必填', () => {
    const schema: FormSchema = {
      fields: [
        { key: 'amount', label: '金额', type: 'money', required: false,
          requiredWhen: { field: 'type', operator: '==', value: 'expense' } },
      ],
    };

    it('requiredWhen 条件不满足时字段可选', () => {
      expect(validateFormData(schema, { type: 'income' })).toEqual([]);
    });

    it('requiredWhen 条件满足时字段必填', () => {
      const errors = validateFormData(schema, { type: 'expense' });
      expect(errors).toContain('金额不能为空');
    });
  });

  describe('table 类型校验', () => {
    const schema: FormSchema = {
      fields: [
        {
          key: 'lines', label: '采购明细', type: 'table', required: true,
          children: [
            { key: 'assetName', label: '资产名称', type: 'text', required: true },
            { key: 'quantity', label: '数量', type: 'number', required: true, min: 1 },
          ],
        },
      ],
    };

    it('table 行内字段缺失报错', () => {
      const errors = validateFormData(schema, {
        lines: [{ assetName: '', quantity: 0 }],
      });
      expect(errors).toContain('采购明细(第1行): 资产名称不能为空');
    });

    it('table 空数组在 required 时报错', () => {
      const errors = validateFormData(schema, { lines: [] });
      expect(errors).toContain('采购明细不能为空');
    });

    it('table 行内数据正确时通过', () => {
      const errors = validateFormData(schema, {
        lines: [{ assetName: '电脑', quantity: 5 }],
      });
      expect(errors).toEqual([]);
    });
  });

  describe('数值范围校验', () => {
    const schema: FormSchema = {
      fields: [
        { key: 'cost', label: '维修费用', type: 'money', required: true, min: 100 },
      ],
    };

    it('值小于 min 时报错', () => {
      const errors = validateFormData(schema, { cost: 50 });
      expect(errors).toContain('维修费用不能小于100');
    });

    it('值等于 min 时通过', () => {
      expect(validateFormData(schema, { cost: 100 })).toEqual([]);
    });
  });
});

// =====================================================
// filterNodesByCondition 测试
// =====================================================

describe('filterNodesByCondition', () => {
  const nodes: WorkflowNodeDef[] = [
    { order: 1, name: '需求提报', type: 'role', roleCode: 'admin' },
    { order: 2, name: '行政询价', type: 'data_input', roleCode: 'admin_staff',
      condition: { field: 'estimatedCost', operator: '>=', value: 500 } },
    { order: 3, name: '总经理审批', type: 'role', roleCode: 'admin' },
  ];

  it('无条件节点始终保留', () => {
    const result = filterNodesByCondition(nodes, { estimatedCost: 100 });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('需求提报');
    expect(result[1].name).toBe('总经理审批');
  });

  it('条件满足时保留条件节点', () => {
    const result = filterNodesByCondition(nodes, { estimatedCost: 500 });
    expect(result).toHaveLength(3);
    expect(result[1].name).toBe('行政询价');
  });

  it('条件不满足时过滤掉条件节点', () => {
    const result = filterNodesByCondition(nodes, { estimatedCost: 499 });
    expect(result).toHaveLength(2);
    expect(result.find(n => n.name === '行政询价')).toBeUndefined();
  });

  it('所有节点无条件时全部保留', () => {
    const noConditionNodes: WorkflowNodeDef[] = [
      { order: 1, name: '节点1', type: 'role', roleCode: 'admin' },
      { order: 2, name: '节点2', type: 'role', roleCode: 'admin' },
    ];
    const result = filterNodesByCondition(noConditionNodes, {});
    expect(result).toHaveLength(2);
  });
});
