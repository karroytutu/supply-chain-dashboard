/**
 * EditableFormContext 单元测试
 * 覆盖：Provider 内返回非 null、Provider 外返回 null、setFieldsValue 更新后 getFieldValue 返回新值
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EditableFormProvider, useEditableForm, type EditableFormContextValue } from './EditableFormContext';

// ==================== 测试辅助组件 ====================

/** 消费组件：显示 Context 状态，提供交互按钮 */
function Consumer({ onRender }: { onRender?: (ctx: EditableFormContextValue | null) => void }) {
  const ctx = useEditableForm();
  onRender?.(ctx);
  if (!ctx) return <span data-testid="ctx-status">null</span>;
  return (
    <div>
      <span data-testid="ctx-status">non-null</span>
      <span data-testid="ctx-value">{String(ctx.getFieldValue('testField') ?? '')}</span>
      <button data-testid="btn-set" onClick={() => ctx.setFieldsValue({ testField: 'hello' })}>
        set
      </button>
    </div>
  );
}

// ==================== 测试用例 ====================

describe('EditableFormContext', () => {
  it('Provider 外 useEditableForm 返回 null', () => {
    render(<Consumer />);
    expect(screen.getByTestId('ctx-status').textContent).toBe('null');
  });

  it('Provider 内 useEditableForm 返回非 null 对象', () => {
    const value: EditableFormContextValue = {
      setFieldsValue: () => {},
      getFieldValue: () => undefined,
    };
    render(
      <EditableFormProvider value={value}>
        <Consumer />
      </EditableFormProvider>
    );
    expect(screen.getByTestId('ctx-status').textContent).toBe('non-null');
  });

  it('setFieldsValue 更新状态后 getFieldValue 返回新值', () => {
    // 用 useState 模拟真实的 EditableFormSection 行为
    function TestWrapper() {
      const [values, setValues] = React.useState<Record<string, unknown>>({});
      const value: EditableFormContextValue = React.useMemo(() => ({
        setFieldsValue: (newValues) => setValues(prev => ({ ...prev, ...newValues })),
        getFieldValue: (name) => values[name],
      }), [values]);
      return (
        <EditableFormProvider value={value}>
          <Consumer />
        </EditableFormProvider>
      );
    }

    render(<TestWrapper />);

    // 初始值为空
    expect(screen.getByTestId('ctx-value').textContent).toBe('');

    // 点击按钮触发 setFieldsValue
    act(() => {
      screen.getByTestId('btn-set').click();
    });

    // getFieldValue 返回新值
    expect(screen.getByTestId('ctx-value').textContent).toBe('hello');
  });
});
