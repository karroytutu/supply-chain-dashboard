/**
 * DetailRightColumn 操作型/审批型节点按钮布局测试
 * @module pages/Oa/Detail/components/DetailRightColumn.spec
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApprovalDetail } from '@/types/oa';

// Mock sub-components
vi.mock('@/components/Oa', () => ({
  ApprovalFlow: () => <div data-testid="approval-flow">Flow</div>,
  ActionModal: ({ visible }: { visible: boolean }) => visible ? <div data-testid="action-modal">Modal</div> : null,
}));

// CSS modules mock
vi.mock('../index.less', () => ({
  default: new Proxy({}, { get: (_, k) => String(k) }),
}));

import { DetailRightColumn } from './DetailRightColumn';

// =====================================================
// Test helpers
// =====================================================

const baseNode = {
  id: 1, nodeOrder: 1, nodeName: 'N', nodeType: 'role',
  assignedUserId: 1, assignedUserName: 'tester',
  status: 'pending' as const, actionComment: null, actedAt: null,
};

const makeDetail = (interactionType: 'approval' | 'operation' = 'approval'): ApprovalDetail => ({
  id: 100, instanceNo: 'OA-1', formTypeCode: 'c', formTypeName: 'T', formTypeIcon: null,
  title: 't', status: 'pending', applicantId: 2, applicantName: 'Z', applicantDept: null,
  currentNodeOrder: 1, currentNodeName: 'N', submittedAt: '2026-01-01', completedAt: null,
  formData: {}, formSchema: { fields: [] },
  workflowDef: { nodes: [{ order: 1, name: 'N', type: 'role', interactionType }] },
  nodes: [baseNode], actions: [], ccUsers: [], erpMeta: null,
});

// Ant Design 两字中文按钮名会插入空格，用 \s* 匹配
const BTN = {
  approve: /同\s*意/,
  complete: /完\s*成/,
  reject_op: /驳\s*回/,   // 审批型：驳回
  reject: /拒\s*绝/,
  transfer: /转\s*交/,
  update: /更\s*新/,
  more: /更\s*多/,
  withdraw: /撤\s*回\s*审\s*批/,
};

const noop = vi.fn();
const baseProps = {
  detail: makeDetail('approval'),
  nodes: [baseNode],
  actions: [],
  actionLoading: false,
  actionModalVisible: false,
  actionType: null as const,
  actionComment: '',
  transferUsers: [],
  getCurrentStep: () => 0,
  canOperate: () => true,
  canWithdraw: () => false,
  openActionModal: noop as any,
  handleAction: noop,
  handleWithdraw: noop,
  setActionModalVisible: noop,
  setActionComment: noop,
  setTransferUserId: noop,
};

beforeEach(() => vi.clearAllMocks());

// =====================================================
// Tests
// =====================================================

describe('DetailRightColumn - 审批型节点 (interactionType=approval)', () => {
  it('显示"同意""驳回""转交"按钮', () => {
    render(<DetailRightColumn {...baseProps} detail={makeDetail('approval')} />);
    expect(screen.getByRole('button', { name: BTN.approve })).toBeTruthy();
    expect(screen.getByRole('button', { name: BTN.reject_op })).toBeTruthy();
    expect(screen.getByRole('button', { name: BTN.transfer })).toBeTruthy();
  });

  it('不显示"完成""更新"按钮', () => {
    render(<DetailRightColumn {...baseProps} detail={makeDetail('approval')} />);
    expect(screen.queryByRole('button', { name: BTN.complete })).toBeNull();
    expect(screen.queryByRole('button', { name: BTN.update })).toBeNull();
  });

  it('点击"同意"调用 openActionModal(approve)', () => {
    const openActionModal = vi.fn();
    render(<DetailRightColumn {...baseProps} detail={makeDetail('approval')} openActionModal={openActionModal} />);
    fireEvent.click(screen.getByRole('button', { name: BTN.approve }));
    expect(openActionModal).toHaveBeenCalledWith('approve');
  });
});

describe('DetailRightColumn - 操作型节点 (interactionType=operation)', () => {
  it('显示"完成""更新""更多"按钮', () => {
    render(<DetailRightColumn {...baseProps} detail={makeDetail('operation')} />);
    expect(screen.getByRole('button', { name: BTN.complete })).toBeTruthy();
    expect(screen.getByRole('button', { name: BTN.update })).toBeTruthy();
    expect(screen.getByRole('button', { name: BTN.more })).toBeTruthy();
  });

  it('不显示"同意""驳回"按钮', () => {
    render(<DetailRightColumn {...baseProps} detail={makeDetail('operation')} />);
    expect(screen.queryByRole('button', { name: BTN.approve })).toBeNull();
    expect(screen.queryByRole('button', { name: BTN.reject_op })).toBeNull();
  });

  it('点击"完成"调用 openActionModal(approve)', () => {
    const openActionModal = vi.fn();
    render(<DetailRightColumn {...baseProps} detail={makeDetail('operation')} openActionModal={openActionModal} />);
    fireEvent.click(screen.getByRole('button', { name: BTN.complete }));
    expect(openActionModal).toHaveBeenCalledWith('approve');
  });

  it('点击"更新"调用 openActionModal(update)', () => {
    const openActionModal = vi.fn();
    render(<DetailRightColumn {...baseProps} detail={makeDetail('operation')} openActionModal={openActionModal} />);
    fireEvent.click(screen.getByRole('button', { name: BTN.update }));
    expect(openActionModal).toHaveBeenCalledWith('update');
  });
});

describe('DetailRightColumn - 撤回按钮', () => {
  it('canOperate=false 且 canWithdraw=true 时显示撤回按钮', () => {
    render(
      <DetailRightColumn {...baseProps} canOperate={() => false} canWithdraw={() => true} />
    );
    expect(screen.getByRole('button', { name: BTN.withdraw })).toBeTruthy();
  });

  it('canOperate=true 时不显示撤回按钮', () => {
    render(<DetailRightColumn {...baseProps} canOperate={() => true} canWithdraw={() => true} />);
    expect(screen.queryByRole('button', { name: BTN.withdraw })).toBeNull();
  });

  it('canOperate=false 且 canWithdraw=false 时不显示任何操作按钮', () => {
    render(
      <DetailRightColumn {...baseProps} canOperate={() => false} canWithdraw={() => false} />
    );
    expect(screen.queryByRole('button', { name: BTN.approve })).toBeNull();
    expect(screen.queryByRole('button', { name: BTN.complete })).toBeNull();
    expect(screen.queryByRole('button', { name: BTN.withdraw })).toBeNull();
  });
});
