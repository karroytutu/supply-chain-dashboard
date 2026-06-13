/**
 * useApprovalCenter 组合 Hook 单元测试
 * 重点覆盖 selectNextPending 索引边界逻辑和 handleActionComplete 调用顺序
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ApprovalInstance } from '@/types/oa';

// ==================== Mocks ====================

const { mockFilters, mockData } = vi.hoisted(() => {
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

  return { mockFilters, mockData };
});

vi.mock('./useApprovalCenterFilters', () => ({
  useApprovalCenterFilters: () => mockFilters,
}));

vi.mock('./useApprovalCenterData', () => ({
  useApprovalCenterData: () => mockData,
}));

import { useApprovalCenter } from './useApprovalCenter';

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
  mockData.list = [];
});

describe('selectNextPending 索引边界', () => {
  it('newList 为空 → setSelectedId(null)', async () => {
    // 原列表有 3 条
    mockData.list = [makeInstance(1), makeInstance(2), makeInstance(3)];
    mockData.loadList.mockResolvedValue([]);
    mockData.loadStats.mockResolvedValue(undefined);

    const { result } = renderHook(() => useApprovalCenter());

    await act(async () => {
      await result.current.handleActionComplete(1);
    });

    expect(mockFilters.setSelectedId).toHaveBeenCalledWith(null);
  });

  it('processedId 在列表首位 + 多条记录 → 选中同 index（新列表首位）', async () => {
    mockData.list = [makeInstance(1), makeInstance(2), makeInstance(3)];
    const newList = [makeInstance(2), makeInstance(3)];
    mockData.loadList.mockResolvedValue(newList);

    const { result } = renderHook(() => useApprovalCenter());

    await act(async () => {
      await result.current.handleActionComplete(1);
    });

    // currentIndex=0, min(0, 1)=0 → newList[0].id = 2
    expect(mockFilters.setSelectedId).toHaveBeenCalledWith(2);
  });

  it('processedId 在列表中间 → 选中同 index', async () => {
    mockData.list = [makeInstance(1), makeInstance(2), makeInstance(3)];
    const newList = [makeInstance(1), makeInstance(3), makeInstance(4)];
    mockData.loadList.mockResolvedValue(newList);

    const { result } = renderHook(() => useApprovalCenter());

    await act(async () => {
      await result.current.handleActionComplete(2);
    });

    // currentIndex=1, min(1, 2)=1 → newList[1].id = 3
    expect(mockFilters.setSelectedId).toHaveBeenCalledWith(3);
  });

  it('processedId 在列表末位 → min(lastIndex, newList.length-1) 选中末尾', async () => {
    mockData.list = [makeInstance(1), makeInstance(2), makeInstance(3)];
    const newList = [makeInstance(1), makeInstance(2), makeInstance(4), makeInstance(5)];
    mockData.loadList.mockResolvedValue(newList);

    const { result } = renderHook(() => useApprovalCenter());

    await act(async () => {
      await result.current.handleActionComplete(3);
    });

    // currentIndex=2, min(2, 3)=2 → newList[2].id = 4
    expect(mockFilters.setSelectedId).toHaveBeenCalledWith(4);
  });

  it('processedId 不在列表中（findIndex=-1）→ 回退到 index 0', async () => {
    mockData.list = [makeInstance(1), makeInstance(2)];
    const newList = [makeInstance(3), makeInstance(4)];
    mockData.loadList.mockResolvedValue(newList);

    const { result } = renderHook(() => useApprovalCenter());

    await act(async () => {
      await result.current.handleActionComplete(99); // 不在原列表中
    });

    // currentIndex=-1, Math.max(-1, 0)=0 → min(0, 1)=0 → newList[0].id = 3
    expect(mockFilters.setSelectedId).toHaveBeenCalledWith(3);
  });
});

describe('handleActionComplete 调用顺序', () => {
  it('按序调用 loadList → loadStats → selectNextPending', async () => {
    const callOrder: string[] = [];
    mockData.list = [makeInstance(1), makeInstance(2)];
    mockData.loadList.mockImplementation(() => {
      callOrder.push('loadList');
      return Promise.resolve([makeInstance(2)]);
    });
    mockData.loadStats.mockImplementation(() => {
      callOrder.push('loadStats');
    });

    const { result } = renderHook(() => useApprovalCenter());

    await act(async () => {
      await result.current.handleActionComplete(1);
    });

    expect(callOrder).toEqual(['loadList', 'loadStats']);
    expect(mockData.loadList).toHaveBeenCalledTimes(1);
    expect(mockData.loadStats).toHaveBeenCalledTimes(1);
    expect(mockFilters.setSelectedId).toHaveBeenCalled();
  });
});
