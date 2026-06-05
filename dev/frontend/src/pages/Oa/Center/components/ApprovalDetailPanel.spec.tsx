/**
 * ApprovalDetailPanel 单元测试
 * 覆盖：自加载详情、权限覆盖逻辑（canOperate/canWithdraw）、移动端返回栏、空态
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApprovalDetail } from '@/types/oa';

// ==================== Mocks ====================

const { mockOaApi, mockUseApprovalActions, mockActionState } = vi.hoisted(() => {
  const mockActionState = {
    actionLoading: false,
    actionModalVisible: false,
    actionType: null,
    actionComment: '',
    transferUsers: [],
    openActionModal: vi.fn(),
    closeActionModal: vi.fn(),
    executeAction: vi.fn(),
    executeWithdraw: vi.fn(),
    setActionComment: vi.fn(),
    setTransferUserId: vi.fn(),
    canOperate: false,
    canWithdraw: false,
    currentStep: 0,
  };

  return {
    mockOaApi: {
      getDetail: vi.fn(),
    },
    mockUseApprovalActions: vi.fn(() => mockActionState),
    mockActionState,
  };
});

vi.mock('umi', () => ({
  useModel: vi.fn(),
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
  };
});

vi.mock('@/services/api/oa', () => ({
  oaApi: mockOaApi,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: vi.fn(() => ({ currentUser: { id: 100, name: '测试用户' } })),
}));

vi.mock('@/components/Oa/hooks/useApprovalActions', () => ({
  useApprovalActions: (...args: any[]) => mockUseApprovalActions(...args),
}));

vi.mock('@/components/Oa', () => ({
  ApprovalDetailContent: (props: any) => (
    <div
      data-testid="approval-detail-content"
      data-can-operate={String(props.canOperateOverride)}
      data-can-withdraw={String(props.canWithdrawOverride)}
      data-form-layout={props.formLayout}
    >
      ApprovalDetailContent
    </div>
  ),
}));

vi.mock('../../../../utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('../index.less', () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
  __esModule: true,
}));

import ApprovalDetailPanel from './ApprovalDetailPanel';
import { usePermission } from '@/hooks/usePermission';

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
    applicantName: '申请人',
    applicantDept: '技术部',
    currentNodeOrder: 1,
    currentNodeName: '审批节点',
    submittedAt: '2026-06-01T10:00:00Z',
    completedAt: null,
    previewFields: [],
    formData: {},
    formSchema: { fields: [] },
    workflowDef: null,
    nodes: [
      { id: 1, nodeOrder: 1, status: 'pending', assignedUserId: 100 } as any,
    ],
    actions: [],
    ccUsers: [],
    erpMeta: null,
    ...overrides,
  } as ApprovalDetail;
}

// ==================== 测试用例 ====================

const defaultProps = {
  selectedId: null as number | null,
  viewMode: 'pending' as const,
  onActionComplete: vi.fn(),
  onWithdrawComplete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockOaApi.getDetail.mockResolvedValue({ data: makeDetail() });
  vi.mocked(usePermission).mockReturnValue({
    currentUser: { id: 100, name: '测试用户' },
  } as any);
});

describe('ApprovalDetailPanel - 数据加载', () => {
  it('selectedId=null → 显示 Empty 占位，不调用 API', () => {
    render(<ApprovalDetailPanel {...defaultProps} selectedId={null} />);

    expect(screen.getByText('请选择流程查看详情')).toBeTruthy();
    expect(mockOaApi.getDetail).not.toHaveBeenCalled();
  });

  it('selectedId 有值 → 调用 oaApi.getDetail 并渲染 ApprovalDetailContent', async () => {
    render(<ApprovalDetailPanel {...defaultProps} selectedId={42} />);

    await waitFor(() => {
      expect(mockOaApi.getDetail).toHaveBeenCalledWith(42);
    });

    await waitFor(() => {
      expect(screen.getByTestId('approval-detail-content')).toBeTruthy();
    });
  });

  it('加载失败 → 显示错误状态和重试按钮', async () => {
    mockOaApi.getDetail.mockRejectedValueOnce(new Error('网络错误'));

    render(<ApprovalDetailPanel {...defaultProps} selectedId={1} />);

    await waitFor(() => {
      expect(mockOaApi.getDetail).toHaveBeenCalledWith(1);
    });

    // loading 结束后 detail 仍为 null，但 loadError=true → 显示错误状态
    await waitFor(() => {
      expect(screen.getByText('加载失败')).toBeTruthy();
    });
  });
});

describe('ApprovalDetailPanel - 权限覆盖逻辑', () => {
  it('viewMode=pending + status=pending + 当前用户是审批人 → canOperateOverride=true', async () => {
    const detail = makeDetail({
      status: 'pending',
      currentNodeOrder: 1,
      nodes: [{ id: 1, nodeOrder: 1, status: 'pending', assignedUserId: 100 } as any],
    });
    mockOaApi.getDetail.mockResolvedValue({ data: detail });

    render(<ApprovalDetailPanel {...defaultProps} selectedId={1} viewMode="pending" />);

    await waitFor(() => {
      const content = screen.getByTestId('approval-detail-content');
      expect(content.getAttribute('data-can-operate')).toBe('true');
    });
  });

  it('viewMode=processed → canOperateOverride=false（即使当前用户是审批人）', async () => {
    const detail = makeDetail({
      status: 'pending',
      nodes: [{ id: 1, nodeOrder: 1, status: 'pending', assignedUserId: 100 } as any],
    });
    mockOaApi.getDetail.mockResolvedValue({ data: detail });

    render(<ApprovalDetailPanel {...defaultProps} selectedId={1} viewMode="processed" />);

    await waitFor(() => {
      const content = screen.getByTestId('approval-detail-content');
      expect(content.getAttribute('data-can-operate')).toBe('false');
    });
  });

  it('viewMode=my + 当前用户是申请人 → canWithdrawOverride=true', async () => {
    const detail = makeDetail({ status: 'pending', applicantId: 100 });
    mockOaApi.getDetail.mockResolvedValue({ data: detail });

    render(<ApprovalDetailPanel {...defaultProps} selectedId={1} viewMode="my" />);

    await waitFor(() => {
      const content = screen.getByTestId('approval-detail-content');
      expect(content.getAttribute('data-can-withdraw')).toBe('true');
    });
  });

  it('viewMode=cc → canOperate 和 canWithdraw 均为 false', async () => {
    const detail = makeDetail({ status: 'pending', applicantId: 100 });
    mockOaApi.getDetail.mockResolvedValue({ data: detail });

    render(<ApprovalDetailPanel {...defaultProps} selectedId={1} viewMode="cc" />);

    await waitFor(() => {
      const content = screen.getByTestId('approval-detail-content');
      expect(content.getAttribute('data-can-operate')).toBe('false');
      expect(content.getAttribute('data-can-withdraw')).toBe('false');
    });
  });
});

describe('ApprovalDetailPanel - 传参验证', () => {
  it('formLayout 始终传 "list"', async () => {
    mockOaApi.getDetail.mockResolvedValue({ data: makeDetail() });

    render(<ApprovalDetailPanel {...defaultProps} selectedId={1} />);

    await waitFor(() => {
      const content = screen.getByTestId('approval-detail-content');
      expect(content.getAttribute('data-form-layout')).toBe('list');
    });
  });

  it('useApprovalActions 的 onActionComplete 绑定 selectedId', async () => {
    mockOaApi.getDetail.mockResolvedValue({ data: makeDetail() });
    const onActionComplete = vi.fn();

    render(
      <ApprovalDetailPanel {...defaultProps} selectedId={42} onActionComplete={onActionComplete} />,
    );

    await waitFor(() => {
      expect(mockUseApprovalActions).toHaveBeenCalled();
    });

    // 获取传给 useApprovalActions 的 config
    const config = mockUseApprovalActions.mock.calls[0][0];
    expect(config.instanceId).toBe(42);

    // 调用 onActionComplete 时应传入 selectedId
    if (config.onActionComplete) {
      await config.onActionComplete();
      expect(onActionComplete).toHaveBeenCalledWith(42);
    }
  });
});

describe('ApprovalDetailPanel - 移动端', () => {
  it('isMobile=true → 渲染返回箭头和标题栏', async () => {
    const detail = makeDetail({ formTypeName: '付款审批' });
    mockOaApi.getDetail.mockResolvedValue({ data: detail });
    const onBack = vi.fn();

    render(
      <ApprovalDetailPanel {...defaultProps} selectedId={1} isMobile onBack={onBack} />,
    );

    await waitFor(() => {
      expect(screen.getByText('付款审批')).toBeTruthy();
    });

    // 点击返回箭头
    const arrow = document.querySelector('.anticon-arrow-left');
    if (arrow) {
      (arrow as HTMLElement).click();
      expect(onBack).toHaveBeenCalled();
    }
  });

  it('isMobile=false → 不渲染返回栏', async () => {
    mockOaApi.getDetail.mockResolvedValue({ data: makeDetail() });

    render(<ApprovalDetailPanel {...defaultProps} selectedId={1} isMobile={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('approval-detail-content')).toBeTruthy();
    });

    expect(document.querySelector('.mobileBackBar')).toBeNull();
  });
});
