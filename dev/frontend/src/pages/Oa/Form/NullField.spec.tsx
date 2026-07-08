/**
 * NullField 集成测试
 * 验证 NullField 作为 hidden Form.Item 子组件时，form store 可正常读写各种类型的值。
 * 遵循 "test behavior, not implementation" 原则：不测试 NullField 是否返回 null。
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// ==================== jsdom 补丁 ====================

// Ant Design Form 的 Row/useBreakpoint 需要 matchMedia，jsdom 未实现
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

import { Form } from 'antd';

// ==================== 被测组件（从 Form/index.tsx 复制局部定义） ====================

const NullField: React.FC = () => null;

// ==================== 测试用例 ====================

describe('NullField + Form.Item 集成', () => {
  it('可正常读写对象、数组、布尔值', () => {
    const formRef = { current: null as any };

    function Harness() {
      const [form] = Form.useForm();
      formRef.current = form;
      return (
        <Form form={form}>
          <Form.Item name="_internalData" hidden><NullField /></Form.Item>
          <Form.Item name="_hasExistingLicense" hidden><NullField /></Form.Item>
          <Form.Item name="_ids" hidden><NullField /></Form.Item>
        </Form>
      );
    }

    render(<Harness />);
    const form = formRef.current;

    // 对象值
    const detailsValue = { receivableOrderIds: ['A001'], debtIds: [{ id: 1, amount: '100' }] };
    act(() => { form.setFieldValue('_internalData', detailsValue); });
    expect(form.getFieldValue('_internalData')).toEqual(detailsValue);

    // 布尔值
    act(() => { form.setFieldValue('_hasExistingLicense', true); });
    expect(form.getFieldValue('_hasExistingLicense')).toBe(true);

    // 数组值
    const idsValue = [1, 2, 3];
    act(() => { form.setFieldValue('_ids', idsValue); });
    expect(form.getFieldValue('_ids')).toEqual(idsValue);

    // getFieldsValue 可获取所有已注册字段
    const allValues = form.getFieldsValue();
    expect(allValues._internalData).toEqual(detailsValue);
    expect(allValues._hasExistingLicense).toBe(true);
    expect(allValues._ids).toEqual(idsValue);
  });

  it('复杂值（Record、数组）不触发 React warning', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error');

    const formRef = { current: null as any };
    function Harness() {
      const [form] = Form.useForm();
      formRef.current = form;
      return (
        <Form form={form}>
          <Form.Item name="_internalData" hidden><NullField /></Form.Item>
        </Form>
      );
    }

    render(<Harness />);

    // 写入复杂对象
    act(() => {
      formRef.current.setFieldValue('_internalData', {
        records: [{ id: 1, name: 'test' }],
        nested: { deep: { value: true } },
      });
    });

    // 过滤出 React 相关的 warning（排除其他无关错误）
    const reactWarnings = consoleErrorSpy.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('Warning:')
    );
    expect(reactWarnings).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });

  it('边界值（undefined、null）读写不报错', () => {
    const formRef = { current: null as any };
    function Harness() {
      const [form] = Form.useForm();
      formRef.current = form;
      return (
        <Form form={form}>
          <Form.Item name="_field" hidden><NullField /></Form.Item>
        </Form>
      );
    }

    render(<Harness />);
    const form = formRef.current;

    // undefined 读写
    expect(() => {
      act(() => { form.setFieldValue('_field', undefined); });
      form.getFieldValue('_field');
    }).not.toThrow();

    // null 读写
    expect(() => {
      act(() => { form.setFieldValue('_field', null); });
      expect(form.getFieldValue('_field')).toBeNull();
    }).not.toThrow();
  });
});
