/**
 * DataFilterBar 组件单元测试
 * 覆盖：筛选控件渲染、重置交互、筛选标签显示
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import dayjs from 'dayjs';
import type { FormTypeDefinition } from '@/types/oa';

// ==================== jsdom 补丁 ====================

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
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

import DataFilterBar from './DataFilterBar';

// ==================== 测试数据工厂 ====================

function makeFormType(code: string, name: string): FormTypeDefinition {
  return {
    code,
    name,
    icon: 'icon',
    category: 'finance',
    sortOrder: 1,
    description: '',
    version: 1,
    formSchema: { fields: [] },
    workflowDef: { nodes: [] },
  };
}

const defaultFormTypes = [
  makeFormType('other_payment', '其他付款申请单'),
  makeFormType('customer_modify', '客户信息变更'),
];

const defaultProps = {
  formTypeCode: undefined,
  status: undefined,
  dateRange: null as any,
  searchText: '',
  applicantName: '',
  formTypes: defaultFormTypes,
  setFormTypeCode: vi.fn(),
  setStatus: vi.fn(),
  setDateRange: vi.fn(),
  setSearchText: vi.fn(),
  setApplicantName: vi.fn(),
  handleReset: vi.fn(),
  exportMenu: <button data-testid="export-menu-btn">导出</button>,
};

// ==================== 辅助函数 ====================

/** 获取 Antd Select 的 placeholder 文本（通过 .ant-select-selection-placeholder） */
function getSelectPlaceholders(doc: HTMLElement): string[] {
  const placeholders = doc.querySelectorAll('.ant-select-selection-placeholder');
  return Array.from(placeholders).map((el) => el.textContent?.trim() || '');
}

/** 获取 Input 的 placeholder */
function getInputPlaceholders(doc: HTMLElement): string[] {
  const inputs = doc.querySelectorAll('input[placeholder]');
  return Array.from(inputs)
    .map((el) => el.getAttribute('placeholder') || '')
    .filter((p) => p.length > 0);
}

// ==================== 测试用例 ====================

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DataFilterBar 筛选控件', () => {
  it('渲染 Select 和 Input 筛选控件', () => {
    const { container } = render(<DataFilterBar {...defaultProps} />);

    // 至少有 2 个 Select（申请类型 + 审批状态）
    const selects = container.querySelectorAll('.ant-select');
    expect(selects.length).toBeGreaterThanOrEqual(2);

    // Select placeholder 包含"申请类型"和"审批状态"
    const selectPlaceholders = getSelectPlaceholders(container);
    expect(selectPlaceholders).toContain('申请类型');
    expect(selectPlaceholders).toContain('审批状态');

    // Input placeholder 包含"申请人姓名"和"搜索关键词"
    const inputPlaceholders = getInputPlaceholders(container);
    expect(inputPlaceholders).toContain('申请人姓名');
    expect(inputPlaceholders).toContain('搜索关键词');

    // RangePicker 存在（渲染了两个日期 input）
    const rangePicker = container.querySelector('.ant-picker-range');
    expect(rangePicker).toBeTruthy();
  });

  it('审批状态 Select 有 5 个选项', () => {
    const { container } = render(<DataFilterBar {...defaultProps} />);

    // 找到"审批状态" Select 并展开下拉菜单
    const selects = container.querySelectorAll('.ant-select');
    // 审批状态是第二个 Select
    const statusSelect = selects[1];
    fireEvent.mouseDown(statusSelect.querySelector('.ant-select-selector')!);

    // 下拉菜单挂载在 body 下
    const options = document.querySelectorAll('.ant-select-item-option-content');
    const optionTexts = Array.from(options).map((o) => o.textContent);

    expect(optionTexts).toContain('处理中');
    expect(optionTexts).toContain('已通过');
    expect(optionTexts).toContain('已拒绝');
    expect(optionTexts).toContain('已撤回');
    expect(optionTexts).toContain('已取消');
  });

  it('formTypes prop 动态渲染申请类型选项', () => {
    const { container } = render(<DataFilterBar {...defaultProps} />);

    // 找到"申请类型" Select 并展开
    const selects = container.querySelectorAll('.ant-select');
    const typeSelect = selects[0];
    fireEvent.mouseDown(typeSelect.querySelector('.ant-select-selector')!);

    const options = document.querySelectorAll('.ant-select-item-option-content');
    const optionTexts = Array.from(options).map((o) => o.textContent);

    expect(optionTexts).toContain('其他付款申请单');
    expect(optionTexts).toContain('客户信息变更');
  });

  it('Select 有 allowClear 属性', () => {
    const { container } = render(<DataFilterBar {...defaultProps} />);

    // ant-select-allow-clear 类名表示 allowClear 已配置
    const clearableSelects = container.querySelectorAll('.ant-select-allow-clear');
    expect(clearableSelects.length).toBeGreaterThanOrEqual(2);

    // Input 有 allowClear 时渲染 .ant-input-affix-wrapper（包裹 clear icon）
    const inputWrappers = container.querySelectorAll('.ant-input-affix-wrapper');
    expect(inputWrappers.length).toBeGreaterThanOrEqual(2);
  });
});

describe('DataFilterBar 交互', () => {
  it('点击重置按钮 → handleReset 被调用', () => {
    const { container } = render(<DataFilterBar {...defaultProps} />);

    // 找到包含 ReloadOutlined 图标的按钮
    const reloadIcon = container.querySelector('.anticon-reload');
    const resetButton = reloadIcon?.closest('button');

    expect(resetButton).toBeTruthy();
    if (resetButton) {
      fireEvent.click(resetButton);
      expect(defaultProps.handleReset).toHaveBeenCalledTimes(1);
    }
  });

  it('exportMenu 节点正确渲染', () => {
    render(<DataFilterBar {...defaultProps} />);

    expect(screen.getByTestId('export-menu-btn')).toBeTruthy();
  });
});

describe('DataFilterBar 工具栏', () => {
  it('有筛选值时显示 Tag（formTypeCode + status + dateRange）', () => {
    const { container } = render(
      <DataFilterBar
        {...defaultProps}
        formTypeCode="other_payment"
        status="approved"
        dateRange={[dayjs('2026-01-01'), dayjs('2026-06-30')]}
      />
    );

    // 工具栏区域（toolbar）内的 Tag 元素
    const toolbar = container.querySelector('[class*="toolbar"]') || container;
    const tags = toolbar.querySelectorAll('.ant-tag');
    const tagTexts = Array.from(tags).map((t) => t.textContent?.trim());

    // formTypeCode 有值时应显示对应表单类型名的 Tag
    expect(tagTexts).toContain('其他付款申请单');
    // status 有值时应显示状态文本的 Tag
    expect(tagTexts).toContain('已通过');
    // dateRange 有值时应显示日期范围 Tag
    expect(tagTexts).toContain('2026-01-01 ~ 2026-06-30');
  });
});
