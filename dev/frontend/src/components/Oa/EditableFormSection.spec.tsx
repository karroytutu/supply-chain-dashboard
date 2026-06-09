/**
 * EditableFormSection 单元测试
 * 覆盖：fieldPermissions 控制渲染、visibleWhen 联动、fieldOptionFilter 过滤、
 *       validate 校验、getEditedValues 过滤隐藏字段、外部 formData 刷新重置
 */
import React, { createRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FormField, FormSchema, FieldPermission } from '@/types/oa';
import type { EditableFormSectionRef } from './EditableFormSection';

// ==================== Mocks ====================

vi.mock('umi', () => ({ useModel: vi.fn() }));

vi.mock('@/components/Oa', () => ({
  FormFieldRenderer: (props: any) => (
    <span data-testid={`readonly-${props.field?.key}`}>{String(props.value ?? '')}</span>
  ),
  SignaturePad: ({ value, onChange }: any) => (
    <div data-testid="signature-pad">
      <button onClick={() => onChange?.('data:image/png;base64,testSig')}>签名</button>
      {value && <span data-testid="sig-value">{String(value).slice(0, 20)}</span>}
    </div>
  ),
}));

vi.mock('@/pages/Oa/Form/components/ConditionalFieldWrapper', () => ({
  checkCondition: (condition: any, formData: Record<string, unknown>) => {
    if (Array.isArray(condition)) return condition.every(c => formData[c.field] === c.value);
    return formData[condition.field] === condition.value;
  },
}));

vi.mock('./ApprovalDetailContent.less', () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}));

// Ant Design Descriptions 的响应式 observer 需要 matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

import EditableFormSection from './EditableFormSection';

// ==================== 测试数据工厂 ====================

function makeField(overrides: Partial<FormField> = {}): FormField {
  return { key: 'testField', label: '测试字段', type: 'text', required: false, ...overrides };
}

function makeSchema(fields: FormField[]): FormSchema {
  return { fields };
}

/** 催收表单 schema（简化版） */
function makeCollectionSchema(): FormSchema {
  return makeSchema([
    makeField({ key: 'consumerName', label: '客户名称', type: 'text', disabled: true }),
    makeField({
      key: 'action', label: '催收操作', type: 'select', required: true,
      options: [
        { value: 'verify', label: '核销标记' },
        { value: 'extension', label: '申请延期' },
        { value: 'difference', label: '存在差异' },
        { value: 'escalate', label: '升级处理' },
        { value: 'resolve_diff', label: '差异解决' },
        { value: 'send_letter', label: '发函' },
        { value: 'lawsuit', label: '起诉' },
      ],
    }),
    makeField({
      key: 'verifyRemark', label: '核销备注', type: 'text',
      visibleWhen: { field: 'action', operator: '==', value: 'verify' },
    }),
    makeField({
      key: 'extensionDays', label: '延期天数', type: 'number', required: true,
      min: 1, max: 30, suffix: '天',
      visibleWhen: { field: 'action', operator: '==', value: 'extension' },
      requiredWhen: { field: 'action', operator: '==', value: 'extension' },
    }),
    makeField({ key: '_extensionCount', label: '延期次数', type: 'number' }),
  ]);
}

const basePermissions: Record<string, FieldPermission> = {
  consumerName: 'readonly',
  action: 'editable',
  verifyRemark: 'editable',
  extensionDays: 'editable',
  _extensionCount: 'editable',
};

const baseFormData: Record<string, unknown> = {
  consumerName: '测试客户',
  action: null,
  verifyRemark: null,
  extensionDays: null,
  _extensionCount: 0,
};

function makeProps(overrides: Record<string, any> = {}) {
  return {
    formSchema: makeCollectionSchema(),
    formData: baseFormData,
    fieldPermissions: basePermissions,
    resolvedMap: {},
    erpLicenseUrls: [],
    layout: 'list' as const,
    ...overrides,
  };
}

// ==================== 测试用例 ====================

describe('EditableFormSection', () => {
  beforeEach(() => vi.clearAllMocks());

  // ---- fieldPermissions 控制渲染 ----

  describe('fieldPermissions 控制渲染', () => {
    it('readonly 字段使用 FormFieldRenderer 只读渲染', () => {
      render(<EditableFormSection {...makeProps()} />);
      expect(screen.getByTestId('readonly-consumerName')).toBeTruthy();
      expect(screen.getByTestId('readonly-consumerName').textContent).toBe('测试客户');
    });

    it('editable select 字段渲染 .ant-select', () => {
      render(<EditableFormSection {...makeProps()} />);
      expect(document.querySelector('.ant-select')).toBeTruthy();
    });

    it('hidden 字段不渲染', () => {
      const perms = { ...basePermissions, action: 'hidden' as FieldPermission };
      render(<EditableFormSection {...makeProps({ fieldPermissions: perms })} />);
      expect(document.querySelector('.ant-select')).toBeNull();
    });

    it('_ 前缀内部字段不渲染', () => {
      render(<EditableFormSection {...makeProps()} />);
      expect(screen.queryByText('延期次数')).toBeNull();
    });
  });

  // ---- visibleWhen 条件联动 ----

  describe('visibleWhen 条件联动', () => {
    it('action=null 时 verifyRemark 和 extensionDays 隐藏', () => {
      render(<EditableFormSection {...makeProps()} />);
      expect(screen.queryByText('核销备注')).toBeNull();
      expect(screen.queryByText('延期天数')).toBeNull();
    });

    it('formData.action=verify 时 verifyRemark 显示', () => {
      render(<EditableFormSection {...makeProps({ formData: { ...baseFormData, action: 'verify' } })} />);
      expect(screen.getByText('核销备注')).toBeTruthy();
      expect(screen.queryByText('延期天数')).toBeNull();
    });

    it('formData.action=extension 时 extensionDays 显示', () => {
      render(<EditableFormSection {...makeProps({ formData: { ...baseFormData, action: 'extension' } })} />);
      expect(screen.queryByText('核销备注')).toBeNull();
      expect(screen.getByText('延期天数')).toBeTruthy();
    });
  });

  // ---- fieldOptionFilter 过滤选项 ----

  describe('fieldOptionFilter 过滤选项', () => {
    it('应用 filter 后下拉选项被过滤', () => {
      const filter = { action: ['verify', 'extension', 'difference', 'escalate'] };
      render(<EditableFormSection {...makeProps({ fieldOptionFilter: filter })} />);
      // 打开下拉
      const selector = document.querySelector('.ant-select-selector')!;
      fireEvent.mouseDown(selector);
      // 被允许的选项存在
      const options = document.querySelectorAll('.ant-select-item-option-content');
      const texts = Array.from(options).map(o => o.textContent);
      expect(texts).toContain('核销标记');
      expect(texts).toContain('申请延期');
      expect(texts).toContain('存在差异');
      expect(texts).toContain('升级处理');
      // L0 不允许的选项
      expect(texts).not.toContain('差异解决');
      expect(texts).not.toContain('发函');
      expect(texts).not.toContain('起诉');
    });

    it('无 filter 时显示全部选项', () => {
      render(<EditableFormSection {...makeProps()} />);
      const selector = document.querySelector('.ant-select-selector')!;
      fireEvent.mouseDown(selector);
      const options = document.querySelectorAll('.ant-select-item-option-content');
      const texts = Array.from(options).map(o => o.textContent);
      expect(texts).toContain('核销标记');
      expect(texts).toContain('起诉');
      expect(texts).toContain('差异解决');
    });
  });

  // ---- validate() 校验 ----

  describe('validate()', () => {
    it('required 字段为空 → 返回错误', () => {
      const ref = createRef<EditableFormSectionRef>();
      render(<EditableFormSection {...makeProps()} ref={ref} />);
      const errors = ref.current!.validate();
      expect(errors).toContain('「催收操作」不能为空');
    });

    it('required 字段有值 → 无该字段错误', () => {
      const ref = createRef<EditableFormSectionRef>();
      render(<EditableFormSection {...makeProps({ formData: { ...baseFormData, action: 'verify' } })} ref={ref} />);
      const errors = ref.current!.validate();
      expect(errors.filter(e => e.includes('催收操作'))).toHaveLength(0);
    });

    it('requiredWhen 满足且字段为空 → 返回错误', () => {
      const ref = createRef<EditableFormSectionRef>();
      // action=extension 使 extensionDays 可见且 requiredWhen 满足
      render(<EditableFormSection {...makeProps({ formData: { ...baseFormData, action: 'extension' } })} ref={ref} />);
      const errors = ref.current!.validate();
      expect(errors).toContain('「延期天数」不能为空');
    });

    it('不可见字段的 required/requiredWhen 不触发', () => {
      const ref = createRef<EditableFormSectionRef>();
      // action=null → extensionDays 不可见
      render(<EditableFormSection {...makeProps()} ref={ref} />);
      const errors = ref.current!.validate();
      expect(errors.filter(e => e.includes('延期天数'))).toHaveLength(0);
    });

    it('readonly 字段不参与校验', () => {
      const ref = createRef<EditableFormSectionRef>();
      // consumerName 是 readonly，即使 required=true 也不校验
      const schema = makeSchema([
        makeField({ key: 'consumerName', label: '客户名称', type: 'text', required: true }),
      ]);
      const perms = { consumerName: 'readonly' as FieldPermission };
      render(
        <EditableFormSection
          {...makeProps({ formSchema: schema, fieldPermissions: perms, formData: { consumerName: '' } })}
          ref={ref}
        />
      );
      const errors = ref.current!.validate();
      expect(errors).toHaveLength(0);
    });
  });

  // ---- getEditedValues() ----

  describe('getEditedValues()', () => {
    it('未编辑 → 返回空对象', () => {
      const ref = createRef<EditableFormSectionRef>();
      render(<EditableFormSection {...makeProps()} ref={ref} />);
      expect(ref.current!.getEditedValues()).toEqual({});
    });

    it('formData 中已有值 ≠ 原始值 → 不算变更', () => {
      const ref = createRef<EditableFormSectionRef>();
      // action 初始为 verify（非 null），editedValues 初始化为 verify，无 diff
      render(<EditableFormSection {...makeProps({ formData: { ...baseFormData, action: 'verify' } })} ref={ref} />);
      expect(ref.current!.getEditedValues()).toEqual({});
    });

    it('隐藏字段的值不出现在返回结果中', () => {
      const ref = createRef<EditableFormSectionRef>();
      // action=null → extensionDays 不可见，即使 formData 中有值
      render(
        <EditableFormSection
          {...makeProps({ formData: { ...baseFormData, extensionDays: 15 } })}
          ref={ref}
        />
      );
      const values = ref.current!.getEditedValues();
      expect(values.extensionDays).toBeUndefined();
    });
  });

  // ---- 布局模式 ----

  describe('布局模式', () => {
    it('list 布局渲染 formDataSection', () => {
      const { container } = render(<EditableFormSection {...makeProps({ layout: 'list' })} />);
      expect(container.querySelector('.formDataSection')).toBeTruthy();
    });

    it('descriptions 布局渲染 Card + Descriptions', () => {
      const { container } = render(<EditableFormSection {...makeProps({ layout: 'descriptions' })} />);
      expect(container.querySelector('.ant-card')).toBeTruthy();
      expect(container.querySelector('.ant-descriptions')).toBeTruthy();
    });
  });

  // ---- 外部 formData 刷新重置 ----

  describe('外部 formData 刷新', () => {
    it('formData 变化后 editedValues 重置', async () => {
      const ref = createRef<EditableFormSectionRef>();
      const { rerender } = render(
        <EditableFormSection {...makeProps({ formData: { ...baseFormData, action: 'verify' } })} ref={ref} />
      );

      // 此时 getEditedValues 为空（无变更）
      expect(ref.current!.getEditedValues()).toEqual({});

      // 模拟外部 formData 刷新
      rerender(
        <EditableFormSection {...makeProps({ formData: { ...baseFormData, action: 'extension' } })} ref={ref} />
      );

      await waitFor(() => {
        // editedValues 重置为 extension（来自新 formData），无 diff
        expect(ref.current!.getEditedValues()).toEqual({});
      });
    });
  });

  // ---- Input/TextArea 可编辑字段交互 ----

  describe('可编辑字段交互', () => {
    it('text 字段渲染 Input 控件', () => {
      // action=verify → verifyRemark 可见
      render(<EditableFormSection {...makeProps({ formData: { ...baseFormData, action: 'verify' } })} />);
      const input = document.querySelector('input.ant-input') as HTMLInputElement;
      expect(input).toBeTruthy();
    });

    it('number 字段渲染 InputNumber 控件', () => {
      // action=extension → extensionDays 可见
      render(<EditableFormSection {...makeProps({ formData: { ...baseFormData, action: 'extension' } })} />);
      const inputNumber = document.querySelector('.ant-input-number');
      expect(inputNumber).toBeTruthy();
    });

    it('编辑 text 字段后 getEditedValues 包含变更', async () => {
      const ref = createRef<EditableFormSectionRef>();
      render(<EditableFormSection {...makeProps({ formData: { ...baseFormData, action: 'verify' } })} ref={ref} />);
      const input = document.querySelector('input.ant-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '已核销' } });
      await waitFor(() => {
        const values = ref.current!.getEditedValues();
        expect(values.verifyRemark).toBe('已核销');
      });
    });
  });
});
