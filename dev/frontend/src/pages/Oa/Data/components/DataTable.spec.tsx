/**
 * DataTable 组件单元测试
 * 覆盖：列渲染、状态 Tag、导航交互、分页配置、loading 状态
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApprovalInstance } from '@/types/oa';

// ==================== Mocks ====================

const mockPush = vi.fn();

vi.mock('umi', () => ({
  history: { push: (...args: any[]) => mockPush(...args) },
}));

vi.mock('@/utils/format', () => ({
  formatDateTime: (v: string | null) => (v ? `formatted:${v}` : '-'),
}));

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

import DataTable from './DataTable';

// ==================== 测试数据工厂 ====================

function makeInstance(overrides: Partial<ApprovalInstance> & { id: number }): ApprovalInstance {
  return {
    instanceNo: `OA-${overrides.id}`,
    formTypeCode: 'test',
    formTypeName: '测试表单',
    formTypeIcon: null,
    title: `审批 ${overrides.id}`,
    status: 'pending',
    applicantId: 1,
    applicantName: '申请人',
    applicantDept: '技术部',
    currentNodeOrder: 1,
    currentNodeName: '节点',
    submittedAt: '2026-06-01T10:00:00Z',
    completedAt: null,
    previewFields: [],
    ...overrides,
  } as ApprovalInstance;
}

const defaultPagination = { current: 1, pageSize: 20, total: 0 };

// ==================== 测试用例 ====================

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DataTable 渲染', () => {
  it('渲染所有 9 个列标题', () => {
    const { container } = render(
      <DataTable
        dataSource={[]}
        loading={false}
        pagination={defaultPagination}
        onPaginationChange={vi.fn()}
      />,
    );

    const headers = container.querySelectorAll('.ant-table-thead th');
    const headerTexts = Array.from(headers).map((h) => h.textContent?.trim());

    expect(headerTexts).toContain('编号');
    expect(headerTexts).toContain('申请类型');
    expect(headerTexts).toContain('申请人');
    expect(headerTexts).toContain('申请部门');
    expect(headerTexts).toContain('申请时间');
    expect(headerTexts).toContain('状态');
    expect(headerTexts).toContain('当前处理人');
    expect(headerTexts).toContain('完成时间');
    expect(headerTexts).toContain('操作');
  });

  it('传入 2 条数据 → 渲染 2 行', () => {
    const data = [
      makeInstance({ id: 1, applicantName: '张三' }),
      makeInstance({ id: 2, applicantName: '李四' }),
    ];

    const { container } = render(
      <DataTable
        dataSource={data}
        loading={false}
        pagination={{ ...defaultPagination, total: 2 }}
        onPaginationChange={vi.fn()}
      />,
    );

    const rows = container.querySelectorAll('.ant-table-tbody tr.ant-table-row');
    expect(rows.length).toBe(2);
    expect(screen.getByText('张三')).toBeTruthy();
    expect(screen.getByText('李四')).toBeTruthy();
  });

  it('状态列 Tag: pending→处理中, approved→已通过, rejected→已驳回', () => {
    const data = [
      makeInstance({ id: 1, status: 'pending' }),
      makeInstance({ id: 2, status: 'approved' }),
      makeInstance({ id: 3, status: 'rejected' }),
    ];

    const { container } = render(
      <DataTable
        dataSource={data}
        loading={false}
        pagination={{ ...defaultPagination, total: 3 }}
        onPaginationChange={vi.fn()}
      />,
    );

    // Antd Tag 渲染为 span.ant-tag
    const pendingTag = container.querySelector('.ant-tag-processing');
    const successTag = container.querySelector('.ant-tag-success');
    const errorTag = container.querySelector('.ant-tag-error');

    expect(pendingTag?.textContent).toContain('处理中');
    expect(successTag?.textContent).toContain('已通过');
    expect(errorTag?.textContent).toContain('已驳回');
  });

  it('completedAt / currentApproverName 为 null 时显示 "-"', () => {
    const data = [
      makeInstance({ id: 1, completedAt: null }),
    ];

    const { container } = render(
      <DataTable
        dataSource={data as any}
        loading={false}
        pagination={{ ...defaultPagination, total: 1 }}
        onPaginationChange={vi.fn()}
      />,
    );

    // currentApproverName 和 completedAt 为 null 时应显示 '-'
    const dashCells = screen.getAllByText('-');
    expect(dashCells.length).toBeGreaterThanOrEqual(1);
  });
});

describe('DataTable 交互', () => {
  it('点击编号 → history.push("/oa/detail/{id}")', () => {
    const data = [makeInstance({ id: 42, instanceNo: 'OA-42' })];

    render(
      <DataTable
        dataSource={data}
        loading={false}
        pagination={{ ...defaultPagination, total: 1 }}
        onPaginationChange={vi.fn()}
      />,
    );

    // 编号列渲染为 <a> 标签，点击触发 history.push
    const link = screen.getByText('OA-42');
    fireEvent.click(link);

    expect(mockPush).toHaveBeenCalledWith('/oa/detail/42');
  });

  it('点击 "查看" 按钮 → history.push("/oa/detail/{id}")', () => {
    const data = [makeInstance({ id: 99 })];

    render(
      <DataTable
        dataSource={data}
        loading={false}
        pagination={{ ...defaultPagination, total: 1 }}
        onPaginationChange={vi.fn()}
      />,
    );

    const viewButton = screen.getByText('查看');
    fireEvent.click(viewButton);

    expect(mockPush).toHaveBeenCalledWith('/oa/detail/99');
  });
});

describe('DataTable 状态', () => {
  it('loading=true 时显示 Spin', () => {
    const { container } = render(
      <DataTable
        dataSource={[]}
        loading={true}
        pagination={defaultPagination}
        onPaginationChange={vi.fn()}
      />,
    );

    // Antd Table loading 时显示 .ant-spin
    const spin = container.querySelector('.ant-spin');
    expect(spin).toBeTruthy();
  });
});
