/**
 * OA 表单摘要提取单元测试
 * 纯函数测试，无需 mock
 */

import { extractFormSummary } from './oa-form-summary';
import type { FormSchema } from './oa.types';

jest.mock('../../utils/constants', () => ({
  OA_NOTIFICATION_FORM_SUMMARY_MAX_FIELDS: 5,
}));

// 构建 mock FormSchema
function createSchema(fields: any[]): FormSchema {
  return { fields };
}

describe('extractFormSummary', () => {
  it('无 formSchema 时返回空数组', () => {
    expect(extractFormSummary(undefined, { name: 'test' })).toEqual([]);
  });

  it('无 formData 时返回空数组', () => {
    expect(extractFormSummary(createSchema([]), undefined)).toEqual([]);
  });

  it('提取 text 类型字段', () => {
    const schema = createSchema([
      { key: 'payeeName', label: '收款方', type: 'text', required: true },
    ]);
    const data = { payeeName: '张三' };
    const result = extractFormSummary(schema, data);

    expect(result).toEqual([{ key: '收款方', value: '张三' }]);
  });

  it('提取 money 类型字段并格式化为人民币', () => {
    const schema = createSchema([
      { key: 'amount', label: '金额', type: 'money', required: true },
    ]);
    const data = { amount: 15000.5 };
    const result = extractFormSummary(schema, data);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('金额');
    expect(result[0].value).toContain('¥');
    expect(result[0].value).toContain('15,000.50');
  });

  it('提取 select 类型字段并解析 label', () => {
    const schema = createSchema([
      {
        key: 'payType',
        label: '付款方式',
        type: 'select',
        required: true,
        options: [
          { value: 'cash', label: '现金' },
          { value: 'transfer', label: '转账' },
        ],
      },
    ]);
    const data = { payType: 'transfer' };
    const result = extractFormSummary(schema, data);

    expect(result).toEqual([{ key: '付款方式', value: '转账' }]);
  });

  it('select 字段找不到选项时使用原始值', () => {
    const schema = createSchema([
      {
        key: 'status',
        label: '状态',
        type: 'select',
        required: true,
        options: [{ value: 'active', label: '启用' }],
      },
    ]);
    const data = { status: 'unknown' };
    const result = extractFormSummary(schema, data);

    expect(result[0].value).toBe('unknown');
  });

  it('提取 number 类型字段并添加 suffix', () => {
    const schema = createSchema([
      { key: 'quantity', label: '数量', type: 'number', required: true, suffix: '件' },
    ]);
    const data = { quantity: 100 };
    const result = extractFormSummary(schema, data);

    expect(result).toEqual([{ key: '数量', value: '100件' }]);
  });

  it('跳过 textarea 类型（不在可展示列表中）', () => {
    const schema = createSchema([
      { key: 'remark', label: '备注', type: 'textarea', required: false },
    ]);
    const data = { remark: '一些备注' };
    const result = extractFormSummary(schema, data);

    expect(result).toEqual([]);
  });

  it('跳过 bizAlias 以下划线开头的内部字段', () => {
    const schema = createSchema([
      { key: 'internalId', label: '内部ID', type: 'text', required: false, bizAlias: '_internal_id' },
    ]);
    const data = { internalId: '12345' };
    const result = extractFormSummary(schema, data);

    expect(result).toEqual([]);
  });

  it('跳过 disabled 非 text 字段', () => {
    const schema = createSchema([
      { key: 'autoNum', label: '编号', type: 'number', required: false, disabled: true },
    ]);
    const data = { autoNum: 999 };
    const result = extractFormSummary(schema, data);

    expect(result).toEqual([]);
  });

  it('disabled 的 text 字段仍然展示', () => {
    const schema = createSchema([
      { key: 'readOnlyName', label: '只读名称', type: 'text', required: false, disabled: true },
    ]);
    const data = { readOnlyName: '只读值' };
    const result = extractFormSummary(schema, data);

    expect(result).toEqual([{ key: '只读名称', value: '只读值' }]);
  });

  it('跳过 null/undefined/空字符串值', () => {
    const schema = createSchema([
      { key: 'a', label: 'A', type: 'text', required: false },
      { key: 'b', label: 'B', type: 'text', required: false },
      { key: 'c', label: 'C', type: 'text', required: false },
    ]);
    const data = { a: null, b: undefined, c: '' };
    const result = extractFormSummary(schema, data as any);

    expect(result).toEqual([]);
  });

  it('限制最多返回 MAX_FIELDS 个字段', () => {
    const fields = Array.from({ length: 10 }, (_, i) => ({
      key: `field${i}`,
      label: `字段${i}`,
      type: 'text' as const,
      required: false,
    }));
    const schema = createSchema(fields);
    const data: Record<string, string> = {};
    fields.forEach(f => { data[f.key] = `值${f.key}`; });

    const result = extractFormSummary(schema, data);

    expect(result).toHaveLength(5); // OA_NOTIFICATION_FORM_SUMMARY_MAX_FIELDS = 5
  });

  it('radio 类型字段解析 options label', () => {
    const schema = createSchema([
      {
        key: 'gender',
        label: '性别',
        type: 'radio',
        required: true,
        options: [
          { value: 'male', label: '男' },
          { value: 'female', label: '女' },
        ],
      },
    ]);
    const data = { gender: 'male' };
    const result = extractFormSummary(schema, data);

    expect(result).toEqual([{ key: '性别', value: '男' }]);
  });

  it('date 类型字段直接展示原始值', () => {
    const schema = createSchema([
      { key: 'applyDate', label: '申请日期', type: 'date', required: true },
    ]);
    const data = { applyDate: '2026-06-01' };
    const result = extractFormSummary(schema, data);

    expect(result).toEqual([{ key: '申请日期', value: '2026-06-01' }]);
  });
});
