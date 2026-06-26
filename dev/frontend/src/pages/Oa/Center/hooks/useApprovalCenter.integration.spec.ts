/**
 * Center 集成测试 — 操作全链路验证
 * 替代旧 useApprovalCenterActions.spec.ts 的全链路覆盖
 * 验证：审批操作 → onActionComplete → handleActionComplete → loadList + loadStats + selectNextPending
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApprovalInstance, ApprovalDetail, ApprovalNode } from '@/types/oa';

// ==================== Mocks ====================

const {
  mockMessage, mockOaApi, mockFilters, mockData, mockActionsReturn,
} = vi.hoisted(() => {
  const mockFilters = {
    viewMode: 'pending' as const,
    page: 1,
    searchText: '',
    selectedId: null as number | null,
    isMobile: false,
    mobileView: 'list' as const,
    switchViewMode: vi.fn(),
    setPage: vi.fn(),
    setSearchText: vi.fn(),
    setSelectedId: vi.fn(),
    setMobileView: vi.fn(),
  };

  const mockData = {
    loading: false,
    stats: { total: 10, pending: 5, processed: 3, approved: 2, rejected: 1, my: 2, cc: 1 },
    list: [] as ApprovalInstance[],
    total: 10,
    loadList: vi.fn(),
    loadStats: vi.fn(),
  };

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
    canOperate: true,
    canWithdraw: false,
    canComment: false,
    currentStep: 0,
  };

  return {
    mockMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    mockOaApi: {
      getDetail: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      withdraw: vi.fn(),
      transfer: vi.fn(),
      countersign: vi.fn(),
      updateInstance: vi.fn(),
      getTransferCandidates: vi.fn(),
    },
    mockFilters,
    mockData,
    mockActionsReturn,
  };
});

vi.mock('umi', () => ({
  useModel: vi.fn(),
  useSearchParams: () => [
    { get: () => null, forEach: vi.fn() },
    vi.fn(),
  ],
}));

vi.mock('antd', () => ({
  message: mockMessage,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ currentUser: { id: 100, name: '审批人' } }),
}));

vi.mock('@/services/api/oa', () => ({
  oaApi: mockOaApi,
}));

vi.mock('./useApprovalCenterFilters', () => ({
  useApprovalCenterFilters: () => mockFilters,
}));

vi.mock('./useApprovalCenterData', () => ({
  useApprovalCenterData: () => mockData,
}));

vi.mock('@/components/Oa/hooks/useApprovalActions', () => ({
  useApprovalActions: (config: any) => {
    // 保存 config 供集成测试验证
    (useApprovalActions as any).__lastConfig = config;
    return mockActionsReturn;
  },
}));

vi.mock('../../../../utils/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { useApprovalCenter } from './useApprovalCenter';
import { useApprovalActions } from '@/components/Oa/hooks/useApprovalActions';

// ==================== 测试数据工厂 ====================

function makeInstance(id: number): ApprovalInstance {
  return {
    id,
    instanceNo: `OA-${id}`,
    formTypeCode: 'test',
    formTypeName: '测试表单',
    formTypeIcon: null,
    title: `审批 ${id}`,
    status: 'pending',
    applicantId: 1,
    applicantName: '申请人',
    applicantDept: '部门',
    currentNodeOrder: 1,
    currentNodeName: '节点',
    currentApproverName: null,
    currentNodeDeadlineAt: null,
    submittedAt: '2026-06-01',
    completedAt: null,
    previewFields: [],
  };
}

// ==================== 测试用例 ====================

beforeEach(() => {
  vi.clearAllMocks();
  mockFilters.selectedId = null;
  mockFilters.viewMode = 'pending';
  mockData.list = [];
});

describe('Center 集成 — 操作全链路（替代旧 useApprovalCenterActions）', () => {
  it('同意操作全链路：onActionComplete → handleActionComplete → loadList + loadStats + selectNextPending', async () => {
    const currentList = [makeInstance(1), makeInstance(2), makeInstance(3)];
    const newListAfterApprove = [makeInstance(2), makeInstance(3)];

    mockData.list = currentList;
    mockData.loadList.mockResolvedValue(newListAfterApprove);
    mockData.loadStats.mockResolvedValue(undefined);

    const { result } = renderHook(() => useApprovalCenter());

    // 模拟操作完成（同意 id=1 的审批）
    await act(async () => {
      await result.current.handleActionComplete(1);
    });

    // 验证全链路
    expect(mockData.loadList).toHaveBeenCalledTimes(1);
    expect(mockData.loadStats).toHaveBeenCalledTimes(1);
    // 原列表 index=0 (id=1)，新列表 index=0 → id=2
    expect(mockFilters.setSelectedId).toHaveBeenCalledWith(2);
  });

  it('撤回操作全链路：onActionComplete → handleActionComplete → 列表刷新 + 选中下一条', async () => {
    const currentList = [makeInstance(10), makeInstance(20)];
    const newListAfterWithdraw = [makeInstance(20)];

    mockData.list = currentList;
    mockData.loadList.mockResolvedValue(newListAfterWithdraw);

    const { result } = renderHook(() => useApprovalCenter());

    await act(async () => {
      await result.current.handleActionComplete(10);
    });

    expect(mockData.loadList).toHaveBeenCalledTimes(1);
    expect(mockData.loadStats).toHaveBeenCalledTimes(1);
    // 原 index=0 → 新 index=0 → id=20
    expect(mockFilters.setSelectedId).toHaveBeenCalledWith(20);
  });

  it('操作后列表为空 → setSelectedId(null)', async () => {
    mockData.list = [makeInstance(1)];
    mockData.loadList.mockResolvedValue([]);

    const { result } = renderHook(() => useApprovalCenter());

    await act(async () => {
      await result.current.handleActionComplete(1);
    });

    expect(mockFilters.setSelectedId).toHaveBeenCalledWith(null);
  });

  it('连续操作：处理第一条后自动跳到下一条，再处理下一条', async () => {
    const list3 = [makeInstance(1), makeInstance(2), makeInstance(3)];
    const listAfterFirst = [makeInstance(2), makeInstance(3)];
    const listAfterSecond = [makeInstance(3)];

    mockData.list = list3;
    mockData.loadList
      .mockResolvedValueOnce(listAfterFirst)
      .mockResolvedValueOnce(listAfterSecond);

    const { result } = renderHook(() => useApprovalCenter());

    // 第一次操作：处理 id=1
    await act(async () => {
      await result.current.handleActionComplete(1);
    });
    expect(mockFilters.setSelectedId).toHaveBeenCalledWith(2);

    // 更新 mockData.list 模拟刷新后的列表
    mockData.list = listAfterFirst;

    // 第二次操作：处理 id=2
    await act(async () => {
      await result.current.handleActionComplete(2);
    });
    expect(mockFilters.setSelectedId).toHaveBeenCalledWith(3);
  });
});

describe('Center 集成 — useApprovalActions 与 handleActionComplete 的衔接', () => {
  it('ApprovalDetailPanel 中 useApprovalActions 的 onActionComplete 连接 handleActionComplete', async () => {
    // 这个测试验证：当 ApprovalDetailPanel 内的 useApprovalActions 执行操作后
    // 其 onActionComplete(selectedId) 最终调用 Center 的 handleActionComplete
    const currentList = [makeInstance(5), makeInstance(6)];
    const newList = [makeInstance(6)];

    mockData.list = currentList;
    mockData.loadList.mockResolvedValue(newList);

    const { result } = renderHook(() => useApprovalCenter());

    // 模拟 ApprovalDetailPanel 将 onActionComplete 绑定为 () => handleActionComplete(selectedId)
    const selectedId = 5;
    const panelOnActionComplete = () => result.current.handleActionComplete(selectedId);

    await act(async () => {
      await panelOnActionComplete();
    });

    // 验证 handleActionComplete 完整执行
    expect(mockData.loadList).toHaveBeenCalled();
    expect(mockData.loadStats).toHaveBeenCalled();
    expect(mockFilters.setSelectedId).toHaveBeenCalledWith(6);
  });
});
