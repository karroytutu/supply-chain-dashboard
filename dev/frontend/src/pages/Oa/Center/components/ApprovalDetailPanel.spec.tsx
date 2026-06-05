/**
 * ApprovalDetailPanel 操作型/审批型节点 UI 差异化测试
 * @module pages/Oa/Center/components/ApprovalDetailPanel.spec
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApprovalDetail } from '@/types/oa';

// Mock hooks
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ currentUser: { id: 1, name: 'tester' } }),
}));

vi.mock('@/components/Oa/hooks/useErpFieldResolve', () => ({
  useErpFieldResolve: () => ({ resolvedMap: {} }),
}));

vi.mock('@/components/Oa/hooks/useErpLicenseResolve', () => ({
  useErpLicenseResolve: () => ({ erpLicenseUrls: [] }),
}));

// Mock heavy sub-components
vi.mock('@/components/Oa/ApprovalFlow', () => ({
  default: () => <div data-testid="approval-flow">ApprovalFlow</div>,
}));

vi.mock('@/components/Oa', () => ({
  FormFieldRenderer: ({ value }: { value: unknown }) => <span>{String(value ?? '')}</span>,
}));

vi.mock('@/components/Oa/FormFieldsDiff', () => ({
  default: () => <div>FormFieldsDiff</div>,
  hasOriginalFields: () => false,
}));

vi.mock('../../Form/components/ConditionalFieldWrapper', () => ({
  checkCondition: () => true,
}));

// CSS modules mock - 需要 default 导出
vi.mock('../index.less', () => ({
  default: new Proxy({}, { get: (_, k) => String(k) }),
}));

import ApprovalDetailPanel from './ApprovalDetailPanel';

// =====================================================
// Test helpers
// =====================================================

const baseNode = {
  id: 1,
  nodeOrder: 1,
  nodeName: '审批节点',
  nodeType: 'role',
  assignedUserId: 1,
  assignedUserName: 'tester',
  status: 'pending' as const,
  actionComment: null,
  actedAt: null,
};

const baseDetail: ApprovalDetail = {
  id: 100,
  instanceNo: 'OA-20260601-001',
  formTypeCode: 'ar_collection',
  formTypeName: '催收任务',
  formTypeIcon: null,
  title: '催收任务审批',
  status: 'pending',
  applicantId: 2,
  applicantName: '张三',
  applicantDept: '营销部',
  currentNodeOrder: 1,
  currentNodeName: '审批节点',
  submittedAt: '2026-06-01T00:00:00Z',
  completedAt: null,
  formData: { field1: 'value1' },
  formSchema: { fields: [] },
  workflowDef: {
    nodes: [
      { order: 1, name: '审批节点', type: 'role', interactionType: 'approval' },
    ],
  },
  nodes: [baseNode],
  actions: [],
  ccUsers: [],
  erpMeta: null,
};

const operationDetail: ApprovalDetail = {
  ...baseDetail,
  workflowDef: {
    nodes: [
      { order: 1, name: '操作节点', type: 'role', interactionType: 'operation' },
    ],
  },
};

const noop = vi.fn();
const defaultProps = {
  detailLoading: false,
  detail: baseDetail,
  viewMode: 'pending' as const,
  onApprove: noop,
  onReject: noop,
  onWithdraw: noop,
  onTransfer: noop,
  onUpdate: noop,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// =====================================================
// Tests
// =====================================================

// Ant Design 在两个汉字之间自动插入空格（如“同意”渲染为“同 意”），用 \s* 匹配
const BTN = {
  approve: /同\s*意/,
  reject: /拒\s*绝/,
  complete: /完\s*成/,
  update: /更\s*新/,
  more: /更\s*多/,
};

describe('ApprovalDetailPanel - 审批型节点 (interactionType=approval)', () => {
  it('显示“同意”和“拒绝”按钮', () => {
    render(<ApprovalDetailPanel {...defaultProps} detail={baseDetail} />);
    expect(screen.getByRole('button', { name: BTN.approve })).toBeTruthy();
    expect(screen.getByRole('button', { name: BTN.reject })).toBeTruthy();
  });

  it('不显示“完成”和“更新”按钮', () => {
    render(<ApprovalDetailPanel {...defaultProps} detail={baseDetail} />);
    expect(screen.queryByRole('button', { name: BTN.complete })).toBeNull();
    expect(screen.queryByRole('button', { name: BTN.update })).toBeNull();
  });

  it('点击“同意”触发 onApprove', () => {
    const onApprove = vi.fn();
    render(<ApprovalDetailPanel {...defaultProps} detail={baseDetail} onApprove={onApprove} />);
    fireEvent.click(screen.getByRole('button', { name: BTN.approve }));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('点击“拒绝”触发 onReject', () => {
    const onReject = vi.fn();
    render(<ApprovalDetailPanel {...defaultProps} detail={baseDetail} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: BTN.reject }));
    expect(onReject).toHaveBeenCalledOnce();
  });
});

describe('ApprovalDetailPanel - 操作型节点 (interactionType=operation)', () => {
  it('显示“完成”和“更新”按钮', () => {
    render(<ApprovalDetailPanel {...defaultProps} detail={operationDetail} />);
    expect(screen.getByRole('button', { name: BTN.complete })).toBeTruthy();
    expect(screen.getByRole('button', { name: BTN.update })).toBeTruthy();
  });

  it('不显示“同意”和“拒绝”主按钮', () => {
    render(<ApprovalDetailPanel {...defaultProps} detail={operationDetail} />);
    expect(screen.queryByRole('button', { name: BTN.approve })).toBeNull();
    expect(screen.queryByRole('button', { name: BTN.reject })).toBeNull();
  });

  it('点击“完成”触发 onApprove', () => {
    const onApprove = vi.fn();
    render(
      <ApprovalDetailPanel {...defaultProps} detail={operationDetail} onApprove={onApprove} />
    );
    fireEvent.click(screen.getByRole('button', { name: BTN.complete }));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('点击“更新”触发 onUpdate', () => {
    const onUpdate = vi.fn();
    render(
      <ApprovalDetailPanel {...defaultProps} detail={operationDetail} onUpdate={onUpdate} />
    );
    fireEvent.click(screen.getByRole('button', { name: BTN.update }));
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it('显示“更多”按钮（包含退回和转交）', () => {
    render(<ApprovalDetailPanel {...defaultProps} detail={operationDetail} />);
    expect(screen.getByRole('button', { name: BTN.more })).toBeTruthy();
  });
});

describe('ApprovalDetailPanel - 状态处理', () => {
  it('加载中显示 Spin', () => {
    const { container } = render(
      <ApprovalDetailPanel {...defaultProps} detailLoading={true} detail={null} />
    );
    expect(container.querySelector('.ant-spin')).toBeTruthy();
  });

  it('detail 为 null 显示空状态', () => {
    render(<ApprovalDetailPanel {...defaultProps} detail={null} />);
    expect(screen.getByText('请选择流程查看详情')).toBeTruthy();
  });

  it('非当前审批人时不显示操作按钮', () => {
    // currentUser.id=1, but node assignedUserId=99
    const otherNode = { ...baseNode, assignedUserId: 99 };
    const detail = { ...baseDetail, nodes: [otherNode] };
    render(<ApprovalDetailPanel {...defaultProps} detail={detail} />);
    expect(screen.queryByRole('button', { name: BTN.approve })).toBeNull();
    expect(screen.queryByRole('button', { name: BTN.reject })).toBeNull();
  });
});
