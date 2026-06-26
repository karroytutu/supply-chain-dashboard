import {
  numberToChineseUpper,
  validateFormData,
  validateInputData,
  checkCondition,
} from './oa-form-utils';

describe('numberToChineseUpper', () => {
  it('零返回 零元整', () => {
    expect(numberToChineseUpper(0)).toBe('零元整');
  });

  it('负数', () => {
    expect(numberToChineseUpper(-100)).toBe('负壹佰元整');
  });

  it('整数', () => {
    expect(numberToChineseUpper(1)).toBe('壹元整');
    expect(numberToChineseUpper(10)).toBe('壹拾元整');
    expect(numberToChineseUpper(100)).toBe('壹佰元整');
    expect(numberToChineseUpper(1000)).toBe('壹仟元整');
    expect(numberToChineseUpper(10000)).toBe('壹万元整');
  });

  it('带小数', () => {
    expect(numberToChineseUpper(1.11)).toBe('壹元壹角壹分');
    expect(numberToChineseUpper(0.5)).toBe('伍角');
    expect(numberToChineseUpper(0.05)).toBe('伍分');
  });

  it('中间有零', () => {
    expect(numberToChineseUpper(101)).toBe('壹佰零壹元整');
    expect(numberToChineseUpper(1001)).toBe('壹仟零壹元整');
  });

  it('万位', () => {
    expect(numberToChineseUpper(10001)).toBe('壹万零壹元整');
    expect(numberToChineseUpper(12345)).toBe('壹万贰仟叁佰肆拾伍元整');
  });
});

describe('checkCondition', () => {
  it('== 操作符', () => {
    expect(checkCondition({ field: 'type', operator: '==' as any, value: 'A' }, { type: 'A' })).toBe(true);
    expect(checkCondition({ field: 'type', operator: '==' as any, value: 'A' }, { type: 'B' })).toBe(false);
  });

  it('!= 操作符', () => {
    expect(checkCondition({ field: 'type', operator: '!=' as any, value: 'A' }, { type: 'B' })).toBe(true);
    expect(checkCondition({ field: 'type', operator: '!=' as any, value: 'A' }, { type: 'A' })).toBe(false);
  });

  it('> >= < <= 操作符', () => {
    expect(checkCondition({ field: 'amount', operator: '>' as any, value: 100 }, { amount: 200 })).toBe(true);
    expect(checkCondition({ field: 'amount', operator: '>=' as any, value: 100 }, { amount: 100 })).toBe(true);
    expect(checkCondition({ field: 'amount', operator: '<' as any, value: 100 }, { amount: 50 })).toBe(true);
    expect(checkCondition({ field: 'amount', operator: '<=' as any, value: 100 }, { amount: 100 })).toBe(true);
  });

  it('contains 操作符', () => {
    expect(checkCondition({ field: 'tags', operator: 'contains' as any, value: 'a' }, { tags: ['a', 'b'] })).toBe(true);
    expect(checkCondition({ field: 'tags', operator: 'contains' as any, value: 'c' }, { tags: ['a', 'b'] })).toBe(false);
    expect(checkCondition({ field: 'text', operator: 'contains' as any, value: 'hello' }, { text: 'say hello' })).toBe(true);
  });

  it('not_contains 操作符', () => {
    expect(checkCondition({ field: 'tags', operator: 'not_contains' as any, value: 'c' }, { tags: ['a', 'b'] })).toBe(true);
    expect(checkCondition({ field: 'text', operator: 'not_contains' as any, value: 'bye' }, { text: 'hello' })).toBe(true);
  });

  it('AND 条件数组', () => {
    const conditions: any = [
      { field: 'a', operator: '==', value: 1 },
      { field: 'b', operator: '==', value: 2 },
    ];
    expect(checkCondition(conditions, { a: 1, b: 2 })).toBe(true);
    expect(checkCondition(conditions, { a: 1, b: 3 })).toBe(false);
  });

  it('未知操作符返回 false', () => {
    expect(checkCondition({ field: 'x', operator: 'unknown' as any, value: 1 }, { x: 1 })).toBe(false);
  });
});

describe('validateFormData', () => {
  it('必填字段校验', () => {
    const schema: any = {
      fields: [{ key: 'name', label: '名称', type: 'text', required: true }],
    };
    expect(validateFormData(schema, {})).toEqual(['名称不能为空']);
    expect(validateFormData(schema, { name: 'test' })).toEqual([]);
  });

  it('空数组也算空', () => {
    const schema: any = {
      fields: [{ key: 'items', label: '列表', type: 'text', required: true }],
    };
    expect(validateFormData(schema, { items: [] })).toEqual(['列表不能为空']);
  });

  it('文本长度校验', () => {
    const schema: any = {
      fields: [{ key: 'desc', label: '描述', type: 'text', maxLength: 5 }],
    };
    expect(validateFormData(schema, { desc: '123456' })).toEqual(['描述不能超过5个字符']);
    expect(validateFormData(schema, { desc: '123' })).toEqual([]);
  });

  it('数字校验', () => {
    const schema: any = {
      fields: [{ key: 'amount', label: '金额', type: 'number', min: 0, max: 100 }],
    };
    expect(validateFormData(schema, { amount: 'abc' })).toEqual(['金额必须是数字']);
    expect(validateFormData(schema, { amount: -1 })).toEqual(['金额不能小于0']);
    expect(validateFormData(schema, { amount: 200 })).toEqual(['金额不能大于100']);
    expect(validateFormData(schema, { amount: 50 })).toEqual([]);
  });

  it('下拉选项校验', () => {
    const schema: any = {
      fields: [{
        key: 'type', label: '类型', type: 'select',
        options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }],
      }],
    };
    expect(validateFormData(schema, { type: 'C' })).toEqual(['类型选项无效']);
    expect(validateFormData(schema, { type: 'A' })).toEqual([]);
  });

  it('modal_select 多选值类型校验', () => {
    const schema: any = {
      fields: [{
        key: 'settlementIds', label: '采购结算单', type: 'modal_select',
        multiple: true,
        searchApi: 'purchase_settlements',
      }],
    };
    // 数组值通过校验
    expect(validateFormData(schema, { settlementIds: ['bill1', 'bill2'] })).toEqual([]);
    // 非数组值报错
    expect(validateFormData(schema, { settlementIds: 'not-array' })).toEqual(['采购结算单值格式错误']);
  });

  it('modal_select 单选（表格行内）标量值通过校验', () => {
    const schema: any = {
      fields: [{
        key: 'goodsId', label: '商品', type: 'modal_select',
        searchApi: 'promotion_goods',
      }],
    };
    // 标量值通过
    expect(validateFormData(schema, { goodsId: '12345' })).toEqual([]);
    expect(validateFormData(schema, { goodsId: 12345 })).toEqual([]);
    // 数组值报错（单选不应为数组）
    expect(validateFormData(schema, { goodsId: ['a', 'b'] })).toEqual(['商品值格式错误']);
  });

  it('modal_select 多选保持数组校验', () => {
    const schema: any = {
      fields: [{
        key: 'ids', label: '客户', type: 'modal_select', multiple: true,
        searchApi: 'erp_customers',
      }],
    };
    expect(validateFormData(schema, { ids: ['a', 'b'] })).toEqual([]);
    expect(validateFormData(schema, { ids: 'not-array' })).toEqual(['客户值格式错误']);
  });

  it('条件隐藏跳过校验', () => {
    const schema: any = {
      fields: [{
        key: 'extra', label: '附加', type: 'text', required: true,
        visibleWhen: { field: 'show', operator: '==', value: true },
      }],
    };
    expect(validateFormData(schema, { show: false })).toEqual([]);
    expect(validateFormData(schema, { show: true })).toEqual(['附加不能为空']);
  });

  it('条件必填 requiredWhen', () => {
    const schema: any = {
      fields: [{
        key: 'reason', label: '原因', type: 'text',
        requiredWhen: { field: 'type', operator: '==', value: 'special' },
      }],
    };
    expect(validateFormData(schema, { type: 'normal' })).toEqual([]);
    expect(validateFormData(schema, { type: 'special' })).toEqual(['原因不能为空']);
  });

  it('子表校验 table 类型', () => {
    const schema: any = {
      fields: [{
        key: 'rows', label: '明细', type: 'table',
        children: [{ key: 'qty', label: '数量', type: 'number', required: true }],
      }],
    };
    const result = validateFormData(schema, { rows: [{ qty: '' }, { qty: 5 }] });
    expect(result).toEqual(['明细[1].数量不能为空']);
  });

  describe('nodeZeroPermissions 发起节点权限', () => {
    const schema: any = {
      fields: [
        { key: 'name', label: '名称', type: 'text', required: true },
        { key: 'paymentSubjectId', label: '付款账户', type: 'erp_payment_account', required: true },
        { key: 'remark', label: '备注', type: 'textarea', required: false },
      ],
    };

    it('hidden 字段跳过必填校验（核心修复场景）', () => {
      const perms = { paymentSubjectId: 'hidden' as const };
      // paymentSubjectId 被隐藏且未传值，应通过校验
      expect(validateFormData(schema, { name: '测试' }, perms)).toEqual([]);
    });

    it('不传第三参数时保持原有行为（向后兼容）', () => {
      // 不传第三参数，paymentSubjectId 必填未填应报错
      expect(validateFormData(schema, { name: '测试' })).toContain('付款账户不能为空');
    });

    it('第三参数为 undefined 时保持原有行为', () => {
      expect(validateFormData(schema, { name: '测试' }, undefined)).toContain('付款账户不能为空');
    });

    it('readonly 权限不跳过必填校验', () => {
      const perms = { paymentSubjectId: 'readonly' as const };
      expect(validateFormData(schema, { name: '测试' }, perms)).toContain('付款账户不能为空');
    });

    it('editable 权限不跳过必填校验', () => {
      const perms = { paymentSubjectId: 'editable' as const };
      expect(validateFormData(schema, { name: '测试' }, perms)).toContain('付款账户不能为空');
    });

    it('table 子字段递归不受 nodeZeroPermissions 影响', () => {
      const tableSchema: any = {
        fields: [
          {
            key: 'lines', label: '明细', type: 'table', required: true,
            children: [
              { key: 'qty', label: '数量', type: 'number', required: true },
            ],
          },
          { key: 'paymentSubjectId', label: '付款账户', type: 'text', required: true },
        ],
      };
      const perms = { paymentSubjectId: 'hidden' as const, qty: 'hidden' as const };
      // paymentSubjectId 被隐藏跳过；但 qty 是子字段，递归不传 perms，必填校验仍生效
      const errors = validateFormData(tableSchema, { lines: [{ qty: '' }] }, perms);
      expect(errors).toContain('明细[1].数量不能为空');
      expect(errors).not.toContain('付款账户不能为空');
    });

    it('同时有 visibleWhen 和 hidden 时任一满足即跳过', () => {
      const condSchema: any = {
        fields: [
          {
            key: 'extra', label: '附加', type: 'text', required: true,
            visibleWhen: { field: 'show', operator: '==', value: true },
          },
        ],
      };
      // visibleWhen 不满足 → 跳过
      expect(validateFormData(condSchema, { show: false }, {})).toEqual([]);
      // visibleWhen 满足但 hidden → 跳过
      expect(validateFormData(condSchema, { show: true }, { extra: 'hidden' as const })).toEqual([]);
      // visibleWhen 满足且非 hidden → 报错
      expect(validateFormData(condSchema, { show: true }, { extra: 'editable' as const }))
        .toContain('附加不能为空');
    });
  });
});

describe('validateInputData', () => {
  it('必填字段校验', () => {
    const schema: any = {
      fields: [{ name: 'comment', label: '意见', type: 'text', required: true }],
    };
    expect(validateInputData(schema, {})).toEqual(['意见不能为空']);
    expect(validateInputData(schema, { comment: '同意' })).toEqual([]);
  });

  it('数字类型校验', () => {
    const schema: any = {
      fields: [{ name: 'score', label: '分数', type: 'number', required: false }],
    };
    expect(validateInputData(schema, { score: 'abc' })).toEqual(['分数必须是数字']);
    expect(validateInputData(schema, { score: 85 })).toEqual([]);
    expect(validateInputData(schema, {})).toEqual([]);
  });
});
