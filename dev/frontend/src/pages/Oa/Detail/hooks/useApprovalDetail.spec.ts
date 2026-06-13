/**
 * useApprovalDetail 组合 Hook 单元测试
 * 覆盖：数据层 + 操作层组合、onActionComplete 绑定到 loadDetail、instanceId 解析
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ApprovalDetail } from '@/types/oa';

// ==================== Mocks ====================

const { mockDataReturn, mockActionsConfig } = vi.hoisted(() => {
  const mockDataReturn = {
    loading: false,
    detail: null as ApprovalDetail | null,
    nodes: [],
    actions: [],
    errorType: null as any,
    loadDetail: vi.fn(),
  };

  const mockActionsConfig: any = {};

  return { mockDataReturn, mockActionsConfig };
});

vi.mock('./useApprovalDetailData', () => ({
  useApprovalDetailData: () => mockDataReturn,
}));

const mockActionsReturn = {
  actionLoading: false,
  actionModalVisible: false,
  actionType: null,
  actionComment: '',
  transferUsers: [],
  countersignUserIds: [],
  countersignType: 'after' as const,
  openActionModal: vi.fn(),
  closeActionModal: vi.fn(),
  executeAction: vi.fn(),
  executeWithdraw: vi.fn(),
  setActionComment: vi.fn(),
  setTransferUserId: vi.fn(),
  setCountersignUserIds: vi.fn(),
  setCountersignType: vi.fn(),
  canOperate: false,
  canWithdraw: false,
  canComment: false,
  currentStep: 0,
};

vi.mock('@/components/Oa/hooks/useApprovalActions', () => ({
  useApprovalActions: (config: any) => {
    // 记录传入的 config 以供断言
    Object.assign(mockActionsConfig, config);
    return mockActionsReturn;
  },
}));

vi.mock('umi', () => ({
  useModel: vi.fn(),
}));

vi.mock('antd', () => ({
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ currentUser: { id: 100 } }),
}));

vi.mock('@/services/api/oa', () => ({
  oaApi: {
    getDetail: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    transfer: vi.fn(),
    withdraw: vi.fn(),
    updateInstance: vi.fn(),
    getTransferCandidates: vi.fn(),
  },
}));

import { useApprovalDetail } from './useApprovalDetail';

// ==================== 测试数据工厂 ====================

function makeDetail(): ApprovalDetail {
  return {
    id: 42,
    instanceNo: 'OA-042',
    formTypeCode: 'test',
    formTypeName: '测试',
    formTypeIcon: null,
    title: '测试',
    status: 'pending',
    applicantId: 1,
    applicantName: '申请人',
    applicantDept: '部门',
    currentNodeOrder: 1,
    currentNodeName: '节点',
    currentNodeDeadlineAt: null,
    submittedAt: '2026-06-01',
    completedAt: null,
    previewFields: [],
    formData: {},
    formSchema: { fields: [] },
    workflowDef: null,
    nodes: [],
    actions: [],
    ccUsers: [],
    erpMeta: null,
  } as ApprovalDetail;
}

// ==================== 测试用例 ====================

beforeEach(() => {
  vi.clearAllMocks();
  mockDataReturn.loading = false;
  mockDataReturn.detail = null;
  mockDataReturn.nodes = [];
  mockDataReturn.actions = [];
  mockDataReturn.errorType = null;
  mockDataReturn.loadDetail = vi.fn();
});

describe('useApprovalDetail - 组合入口', () => {
  it('返回数据层和操作层合并的字段', () => {
    const detail = makeDetail();
    mockDataReturn.detail = detail;

    const { result } = renderHook(() => useApprovalDetail('42'));

    // 数据层字段
    expect(result.current.detail).toEqual(detail);
    expect(result.current.loading).toBe(false);
    expect(result.current.errorType).toBeNull();

    // 操作层字段
    expect(result.current.canOperate).toBe(false);
    expect(result.current.openActionModal).toBeDefined();
    expect(result.current.executeAction).toBeDefined();
    expect(result.current.executeWithdraw).toBeDefined();
  });

  it('instanceId 从字符串 id 解析为 number', () => {
    renderHook(() => useApprovalDetail('42'));

    expect(mockActionsConfig.instanceId).toBe(42);
  });

  it('id=undefined → instanceId=undefined', () => {
    renderHook(() => useApprovalDetail(undefined));

    expect(mockActionsConfig.instanceId).toBeUndefined();
  });

  it('onActionComplete 绑定到 data.loadDetail（操作后重新加载详情）', () => {
    const detail = makeDetail();
    mockDataReturn.detail = detail;
    const loadDetailMock = vi.fn();
    mockDataReturn.loadDetail = loadDetailMock;

    renderHook(() => useApprovalDetail('42'));

    // useApprovalActions 的 onActionComplete 应指向 loadDetail
    expect(mockActionsConfig.onActionComplete).toBe(loadDetailMock);
  });

  it('detail 和 nodes 传递给 useApprovalActions', () => {
    const detail = makeDetail();
    const nodes = [{ id: 1, nodeOrder: 1, status: 'pending' }] as any;
    mockDataReturn.detail = detail;
    mockDataReturn.nodes = nodes;

    renderHook(() => useApprovalDetail('42'));

    expect(mockActionsConfig.detail).toBe(detail);
    expect(mockActionsConfig.nodes).toBe(nodes);
  });
});
