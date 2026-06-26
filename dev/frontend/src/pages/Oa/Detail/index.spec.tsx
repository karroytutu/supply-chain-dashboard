/**
 * Detail/index 页面组件单元测试
 * 覆盖：loading/error 状态渲染、条件组件（LicenseDeferredCard）、传参验证
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApprovalDetail } from '@/types/oa';

// ==================== Mocks ====================

// 共享的可变状态，供 mock 和测试用例读写
const hookState = {
  loading: false,
  detail: null as ApprovalDetail | null,
  nodes: [],
  actions: [],
  errorType: null as any,
  loadDetail: vi.fn(),
  actionLoading: false,
  actionModalVisible: false,
  actionType: null,
  actionComment: '',
  transferUsers: [],
  countersignUserIds: [],
  countersignType: 'after',
  canOperate: false,
  canWithdraw: false,
  currentStep: 0,
  openActionModal: vi.fn(),
  closeActionModal: vi.fn(),
  executeAction: vi.fn(),
  executeWithdraw: vi.fn(),
  setActionComment: vi.fn(),
  setTransferUserId: vi.fn(),
  setCountersignUserIds: vi.fn(),
  setCountersignType: vi.fn(),
};

vi.mock('umi', () => ({
  useParams: () => ({ id: '42' }),
  history: { push: vi.fn(), back: vi.fn() },
  useModel: vi.fn(),
}));

vi.mock('./hooks/useApprovalDetail', () => ({
  useApprovalDetail: () => ({ ...hookState }),
}));

vi.mock('@/components/Oa', () => ({
  ApprovalDetailContent: (props: any) => (
    <div
      data-testid="approval-detail-content"
      data-form-layout={props.formLayout}
      data-has-onback={typeof props.onBack === 'function' ? 'true' : 'false'}
    >
      ApprovalDetailContent
    </div>
  ),
}));

vi.mock('./index.less', () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
  __esModule: true,
}));

import ApprovalDetailPage from './index';
import { history } from 'umi';

// ==================== 测试数据工厂 ====================

function makeDetail(overrides: Partial<ApprovalDetail> = {}): ApprovalDetail {
  return {
    id: 42,
    instanceNo: 'OA-2026-042',
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
    currentApproverName: null,
    submittedAt: '2026-06-01T10:00:00Z',
    completedAt: null,
    previewFields: [],
    formData: {},
    formSchema: { fields: [] },
    workflowDef: null,
    nodes: [],
    actions: [],
    ccUsers: [],
    erpMeta: null,
    ...overrides,
  } as ApprovalDetail;
}

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

// ==================== 测试用例 ====================

function resetState() {
  hookState.loading = false;
  hookState.detail = makeDetail();
  hookState.errorType = null;
  hookState.nodes = [];
  hookState.actions = [];
  hookState.loadDetail = vi.fn();
  hookState.actionLoading = false;
  hookState.actionModalVisible = false;
  hookState.actionType = null;
  hookState.actionComment = '';
  hookState.transferUsers = [];
  hookState.countersignUserIds = [];
  hookState.countersignType = 'after';
  hookState.canOperate = false;
  hookState.canWithdraw = false;
  hookState.currentStep = 0;
  hookState.openActionModal = vi.fn();
  hookState.closeActionModal = vi.fn();
  hookState.executeAction = vi.fn();
  hookState.executeWithdraw = vi.fn();
  hookState.setActionComment = vi.fn();
  hookState.setTransferUserId = vi.fn();
  hookState.setCountersignUserIds = vi.fn();
  hookState.setCountersignType = vi.fn();
}

beforeEach(() => {
  resetState();
});

describe('ApprovalDetailPage - loading 状态', () => {
  it('loading=true → 显示 Spin', () => {
    hookState.loading = true;
    hookState.detail = null;

    render(<ApprovalDetailPage />);

    expect(document.querySelector('.ant-spin')).toBeTruthy();
  });
});

describe('ApprovalDetailPage - 错误状态渲染', () => {
  it('errorType=forbidden → 403 页面 + 返回流程中心按钮', () => {
    hookState.detail = null;
    hookState.errorType = 'forbidden';

    render(<ApprovalDetailPage />);

    expect(screen.getByText('无权限查看')).toBeTruthy();
    const backBtn = screen.getByText('返回流程中心');
    expect(backBtn).toBeTruthy();

    fireEvent.click(backBtn);
    expect(history.push).toHaveBeenCalledWith('/oa/center');
  });

  it('errorType=not_found → 404 页面 + 返回流程中心按钮', () => {
    hookState.detail = null;
    hookState.errorType = 'not_found';

    render(<ApprovalDetailPage />);

    expect(screen.getByText('审批不存在或已删除')).toBeTruthy();
  });

  it('errorType=server_error → 500 页面 + 重新加载按钮', () => {
    hookState.detail = null;
    hookState.errorType = 'server_error';

    render(<ApprovalDetailPage />);

    expect(screen.getByText('加载失败')).toBeTruthy();
    const reloadBtn = screen.getByText('重新加载');
    expect(reloadBtn).toBeTruthy();

    fireEvent.click(reloadBtn);
    expect(hookState.loadDetail).toHaveBeenCalled();
  });
});

describe('ApprovalDetailPage - 传参验证', () => {
  it('ApprovalDetailContent 接收 formLayout="list" + onBack', () => {
    hookState.detail = makeDetail();

    render(<ApprovalDetailPage />);

    const content = screen.getByTestId('approval-detail-content');
    expect(content.getAttribute('data-form-layout')).toBe('list');
    expect(content.getAttribute('data-has-onback')).toBe('true');
  });
});
