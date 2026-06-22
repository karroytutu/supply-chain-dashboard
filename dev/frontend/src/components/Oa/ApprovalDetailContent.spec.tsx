/**
 * ApprovalDetailContent 共享组件单元测试
 * 重点覆盖：DetailHeader 渲染、两种表单布局、ActionBar 权限/交互类型、canOperateOverride 覆盖机制
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApprovalDetail } from '@/types/oa';
import type { UseApprovalActionsReturn } from './hooks/useApprovalActions';

// ==================== Mocks ====================

vi.mock('umi', () => ({
  useModel: vi.fn(),
  history: { push: vi.fn(), back: vi.fn() },
  useParams: vi.fn(),
}));

vi.mock('./hooks/useErpFieldResolve', () => ({
  useErpFieldResolve: () => ({ resolvedMap: {} }),
}));

vi.mock('./hooks/useErpLicenseResolve', () => ({
  useErpLicenseResolve: () => ({ erpLicenseUrls: [] }),
}));

vi.mock('./ActionModal', () => ({
  default: (props: any) =>
    props.visible ? <div data-testid="action-modal" data-type={props.actionType}>ActionModal</div> : null,
}));

vi.mock('./FormFieldsDiff', () => ({
  default: (props: any) => <div data-testid="form-diff" data-layout={props.layout}>FormFieldsDiff</div>,
  hasOriginalFields: vi.fn(() => false),
}));

vi.mock('@/components/Oa', () => ({
  ApprovalStatusTag: (props: any) => <span data-testid="status-tag">{props.status}</span>,
  ApprovalFlow: () => <div data-testid="approval-flow">ApprovalFlow</div>,
  FormFieldRenderer: (props: any) => <span data-testid={`field-${props.field?.key}`}>{String(props.value ?? '')}</span>,
}));

vi.mock('@/pages/Oa/Form/components/ConditionalFieldWrapper', () => ({
  checkCondition: () => true,
}));

import ApprovalDetailContent from './ApprovalDetailContent';
import { hasOriginalFields } from './FormFieldsDiff';

// ==================== 测试数据工厂 ====================

function makeDetail(overrides: Partial<ApprovalDetail> = {}): ApprovalDetail {
  return {
    id: 1,
    instanceNo: 'OA-2026-001',
    formTypeCode: 'other_payment',
    formTypeName: '其他付款申请单',
    formTypeIcon: null,
    title: '测试审批',
    status: 'pending',
    applicantId: 100,
    applicantName: '张三',
    applicantDept: '技术部',
    currentNodeOrder: 1,
    currentNodeName: '审批节点',
    submittedAt: '2026-06-01T10:00:00Z',
    completedAt: null,
    previewFields: [],
    formData: { amount: 1000, remark: '测试' },
    formSchema: {
      fields: [
        { key: 'amount', label: '金额', type: 'money', required: true },
        { key: 'remark', label: '备注', type: 'text', required: false },
      ],
    },
    workflowDef: null,
    nodes: [{ id: 1, nodeOrder: 1, round: 1, status: 'pending', assignedUserIds: [100] } as any],
    actions: [],
    ccUsers: [],
    erpMeta: null,
    ...overrides,
  } as ApprovalDetail;
}

function makeActionState(overrides: Partial<UseApprovalActionsReturn> = {}): UseApprovalActionsReturn {
  return {
    actionLoading: false,
    actionModalVisible: false,
    actionType: null,
    actionComment: '',
    transferUsers: [],
    countersignUserIds: [] as number[],
    countersignType: 'after' as 'before' | 'after',
    sendBackTargets: [],
    sendBackTargetNodeOrder: null,
    openActionModal: vi.fn(),
    closeActionModal: vi.fn(),
    executeAction: vi.fn(),
    executeWithdraw: vi.fn(),
    setActionComment: vi.fn(),
    setTransferUserId: vi.fn(),
    setCountersignUserIds: vi.fn(),
    setCountersignType: vi.fn(),
    setSendBackTargetNodeOrder: vi.fn(),
    canOperate: false,
    canWithdraw: false,
    canComment: false,
    currentStep: 0,
    ...overrides,
  };
}

// ==================== jsdom 补丁 ====================

// Ant Design Descriptions 组件使用 matchMedia，jsdom 未实现
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

// ==================== 测试用例 ====================

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasOriginalFields).mockReturnValue(false);
});

describe('ApprovalDetailContent - DetailHeader 渲染', () => {
  it('显示 formTypeName / instanceNo / applicantName', () => {
    const detail = makeDetail();
    const actionState = makeActionState();

    render(<ApprovalDetailContent detail={detail} actionState={actionState} />);

    expect(screen.getByText('其他付款申请单')).toBeTruthy();
    expect(screen.getByText('编号: OA-2026-001')).toBeTruthy();
    expect(screen.getByText('申请人: 张三')).toBeTruthy();
    expect(screen.getByText('部门: 技术部')).toBeTruthy();
    expect(screen.getByTestId('status-tag')).toBeTruthy();
  });

  it('showHeader=false 时不渲染头部信息（Detail 页面使用）', () => {
    const detail = makeDetail();
    const actionState = makeActionState();

    render(<ApprovalDetailContent detail={detail} actionState={actionState} showHeader={false} />);

    expect(screen.queryByText('其他付款申请单')).toBeNull();
    expect(screen.queryByText('编号: OA-2026-001')).toBeNull();
    expect(screen.queryByTestId('status-tag')).toBeNull();
    // 表单和操作区仍然正常渲染
    expect(screen.getByText('表单数据')).toBeTruthy();
  });
});

describe('ApprovalDetailContent - 表单布局', () => {
  it('formLayout="list"（默认）→ 渲染 formDataSection + h3=表单数据', () => {
    const detail = makeDetail();
    const actionState = makeActionState();

    render(<ApprovalDetailContent detail={detail} actionState={actionState} formLayout="list" />);

    expect(screen.getByText('表单数据')).toBeTruthy();
    expect(screen.getByText('金额')).toBeTruthy();
    expect(screen.getByText('备注')).toBeTruthy();
  });

  it('formLayout="descriptions" → 渲染 Card + Descriptions', () => {
    const detail = makeDetail();
    const actionState = makeActionState();

    const { container } = render(
      <ApprovalDetailContent detail={detail} actionState={actionState} formLayout="descriptions" />,
    );

    expect(screen.getByText('表单内容')).toBeTruthy();
    // antd Descriptions 会渲染 .ant-descriptions
    expect(container.querySelector('.ant-descriptions')).toBeTruthy();
  });
});

describe('ApprovalDetailContent - ActionBar 权限', () => {
  it('canOperate=true + approval 类型 → 显示"同意""拒绝""转交"', () => {
    const detail = makeDetail();
    const actionState = makeActionState({ canOperate: true });

    render(<ApprovalDetailContent detail={detail} actionState={actionState} />);

    expect(screen.getByText(/同\s*意/)).toBeTruthy();
    expect(screen.getByText(/拒\s*绝/)).toBeTruthy();
    expect(screen.getByText(/转\s*交/)).toBeTruthy();
  });

  it('canOperate=true + handle 类型 → 显示"完成""保存""退回""转交"', () => {
    const detail = makeDetail({
      workflowDef: { nodes: [{ order: 1, name: '处理节点', type: 'handle' as const }] },
    });
    const actionState = makeActionState({ canOperate: true });

    render(<ApprovalDetailContent detail={detail} actionState={actionState} />);

    expect(screen.getByText(/完\s*成/)).toBeTruthy();
    expect(screen.getByText(/保\s*存/)).toBeTruthy();
    expect(screen.getByText(/退\s*回/)).toBeTruthy();
    expect(screen.getByText(/转\s*交/)).toBeTruthy();
  });

  it('canOperate=false + canWithdraw=true → 显示"撤回审批"', () => {
    const detail = makeDetail();
    const actionState = makeActionState({ canOperate: false, canWithdraw: true });

    render(<ApprovalDetailContent detail={detail} actionState={actionState} />);

    expect(screen.getByText(/撤回审批/)).toBeTruthy();
    expect(screen.queryByText(/同\s*意/)).toBeNull();
  });

  it('canOperateOverride=false 覆盖 actionState.canOperate=true → 不显示操作按钮', () => {
    const detail = makeDetail();
    const actionState = makeActionState({ canOperate: true });

    render(
      <ApprovalDetailContent
        detail={detail}
        actionState={actionState}
        canOperateOverride={false}
      />,
    );

    expect(screen.queryByText(/同\s*意/)).toBeNull();
    expect(screen.queryByText(/拒\s*绝/)).toBeNull();
  });

  it('extraContentBefore 插槽在表单区域前渲染', () => {
    const detail = makeDetail();
    const actionState = makeActionState();
    const extraContent = <div data-testid="extra-before">额外内容</div>;

    const { container } = render(
      <ApprovalDetailContent
        detail={detail}
        actionState={actionState}
        extraContentBefore={extraContent}
      />,
    );

    expect(screen.getByTestId('extra-before')).toBeTruthy();
    // 额外内容应在"表单数据"之前
    const extraEl = screen.getByTestId('extra-before');
    const formLabel = screen.getByText('表单数据');
    expect(extraEl.compareDocumentPosition(formLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('ApprovalDetailContent - ActionModal 集成', () => {
  it('actionModalVisible=true 时 ActionModal 被渲染', () => {
    const detail = makeDetail();
    const actionState = makeActionState({
      actionModalVisible: true,
      actionType: 'approve',
    });

    render(<ApprovalDetailContent detail={detail} actionState={actionState} />);

    const modal = screen.getByTestId('action-modal');
    expect(modal).toBeTruthy();
    expect(modal.getAttribute('data-type')).toBe('approve');
  });

  it('点击"同意"按钮 → 调用 openActionModal("approve")', () => {
    const detail = makeDetail();
    const openActionModal = vi.fn();
    const actionState = makeActionState({ canOperate: true, openActionModal });

    render(<ApprovalDetailContent detail={detail} actionState={actionState} />);

    fireEvent.click(screen.getByText(/同\s*意/));
    expect(openActionModal).toHaveBeenCalledWith('approve');
  });
});

// ==================== Override 机制补充测试 ====================

describe('ApprovalDetailContent - canOperateOverride / canWithdrawOverride 覆盖机制', () => {
  it('canOperateOverride=true + actionState.canOperate=false → 显示操作按钮', () => {
    const detail = makeDetail();
    const actionState = makeActionState({ canOperate: false });

    render(
      <ApprovalDetailContent
        detail={detail}
        actionState={actionState}
        canOperateOverride={true}
      />,
    );

    expect(screen.getByText(/同\s*意/)).toBeTruthy();
    expect(screen.getByText(/拒\s*绝/)).toBeTruthy();
  });

  it('canWithdrawOverride=true + actionState.canWithdraw=false → 显示撤回按钮', () => {
    const detail = makeDetail();
    const actionState = makeActionState({ canOperate: false, canWithdraw: false });

    render(
      <ApprovalDetailContent
        detail={detail}
        actionState={actionState}
        canWithdrawOverride={true}
      />,
    );

    expect(screen.getByText(/撤回审批/)).toBeTruthy();
  });

  it('canWithdrawOverride=false + actionState.canWithdraw=true → 隐藏撤回按钮', () => {
    const detail = makeDetail();
    const actionState = makeActionState({ canOperate: false, canWithdraw: true });

    render(
      <ApprovalDetailContent
        detail={detail}
        actionState={actionState}
        canWithdrawOverride={false}
      />,
    );

    expect(screen.queryByText(/撤回审批/)).toBeNull();
  });

  it('两个 override 均为 undefined → 使用 actionState 的值', () => {
    const detail = makeDetail();
    const actionState = makeActionState({ canOperate: true, canWithdraw: false });

    render(<ApprovalDetailContent detail={detail} actionState={actionState} />);

    // canOperate=true from actionState → 显示操作按钮
    expect(screen.getByText(/同\s*意/)).toBeTruthy();
    // canWithdraw=false from actionState → 不显示撤回
    expect(screen.queryByText(/撤回审批/)).toBeNull();
  });
});
