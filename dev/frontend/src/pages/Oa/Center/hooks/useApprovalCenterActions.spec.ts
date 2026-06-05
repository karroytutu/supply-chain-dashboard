/**
 * useApprovalCenterActions 单元测试
 * 验证审批操作后的自动跳转逻辑
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApprovalInstance } from '@/types/oa';

// Mock API
vi.mock('@/services/api/oa', () => ({
  oaApi: {
    approve: vi.fn().mockResolvedValue({}),
    reject: vi.fn().mockResolvedValue({}),
    withdraw: vi.fn().mockResolvedValue({}),
    transfer: vi.fn().mockResolvedValue({}),
    updateInstance: vi.fn().mockResolvedValue({}),
    getTransferCandidates: vi.fn().mockResolvedValue([]),
  },
}));

// Mock antd message
vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('../../../../utils/errorUtils', () => ({
  getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : ''),
}));

import { useApprovalCenterActions } from './useApprovalCenterActions';
import { oaApi } from '@/services/api/oa';

// =====================================================
// Test helpers
// =====================================================

const makeList = (ids: number[]): ApprovalInstance[] =>
  ids.map((id) => ({
    id,
    instanceNo: `OA-${id}`,
    formTypeCode: 'test',
    formTypeName: '测试表单',
    formTypeIcon: null,
    title: `审批 ${id}`,
    status: 'pending' as const,
    applicantId: 1,
    applicantName: '申请人',
    applicantDept: null,
    currentNodeOrder: 1,
    currentNodeName: '审批节点',
    submittedAt: '2026-06-01',
    completedAt: null,
    previewFields: [],
  }));

const noop = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
});

// =====================================================
// Tests
// =====================================================

describe('useApprovalCenterActions - 自动跳转逻辑', () => {
  it('同意操作后自动选中下一条', async () => {
    const setSelectedId = vi.fn();
    const newList = makeList([2, 3, 4]); // 审批1被处理后返回的新列表
    const reloadList = vi.fn().mockResolvedValue(newList);

    const { result } = renderHook(() =>
      useApprovalCenterActions({
        selectedId: 1,
        setSelectedId,
        currentList: makeList([1, 2, 3, 4]),
        reloadList,
        reloadStats: noop,
        reloadDetail: noop,
      }),
    );

    await act(async () => {
      await result.current.handleApprove();
    });

    expect(oaApi.approve).toHaveBeenCalledWith(1);
    expect(reloadList).toHaveBeenCalled();
    // 原列表 index=0 (id=1)，新列表中 index=0 是 id=2
    expect(setSelectedId).toHaveBeenCalledWith(2);
  });

  it('同意中间项后选中下一条（位置不变）', async () => {
    const setSelectedId = vi.fn();
    const newList = makeList([1, 3, 4]); // 审批2被处理后返回的新列表
    const reloadList = vi.fn().mockResolvedValue(newList);

    const { result } = renderHook(() =>
      useApprovalCenterActions({
        selectedId: 2,
        setSelectedId,
        currentList: makeList([1, 2, 3, 4]),
        reloadList,
        reloadStats: noop,
        reloadDetail: noop,
      }),
    );

    await act(async () => {
      await result.current.handleApprove();
    });

    // 原列表 index=1 (id=2)，新列表中 index=1 是 id=3
    expect(setSelectedId).toHaveBeenCalledWith(3);
  });

  it('处理最后一条后选中新的最后一条', async () => {
    const setSelectedId = vi.fn();
    const newList = makeList([1, 2]); // 审批3被处理后只剩2条
    const reloadList = vi.fn().mockResolvedValue(newList);

    const { result } = renderHook(() =>
      useApprovalCenterActions({
        selectedId: 3,
        setSelectedId,
        currentList: makeList([1, 2, 3]),
        reloadList,
        reloadStats: noop,
        reloadDetail: noop,
      }),
    );

    await act(async () => {
      await result.current.handleApprove();
    });

    // 原列表 index=2 (id=3)，新列表只有2条，min(2, 1)=1 → id=2
    expect(setSelectedId).toHaveBeenCalledWith(2);
  });

  it('处理后列表为空时清除选中', async () => {
    const setSelectedId = vi.fn();
    const reloadList = vi.fn().mockResolvedValue([]);

    const { result } = renderHook(() =>
      useApprovalCenterActions({
        selectedId: 1,
        setSelectedId,
        currentList: makeList([1]),
        reloadList,
        reloadStats: noop,
        reloadDetail: noop,
      }),
    );

    await act(async () => {
      await result.current.handleApprove();
    });

    expect(setSelectedId).toHaveBeenCalledWith(null);
  });

  it('拒绝操作后也自动跳转下一条', async () => {
    const setSelectedId = vi.fn();
    const newList = makeList([2, 3]);
    const reloadList = vi.fn().mockResolvedValue(newList);

    const { result } = renderHook(() =>
      useApprovalCenterActions({
        selectedId: 1,
        setSelectedId,
        currentList: makeList([1, 2, 3]),
        reloadList,
        reloadStats: noop,
        reloadDetail: noop,
      }),
    );

    // 先设置拒绝原因
    act(() => {
      result.current.reject.setReason('测试拒绝原因');
    });

    await act(async () => {
      await result.current.handleReject();
    });

    expect(oaApi.reject).toHaveBeenCalledWith(1, { comment: '测试拒绝原因' });
    expect(setSelectedId).toHaveBeenCalledWith(2);
  });

  it('转交操作后也自动跳转下一条', async () => {
    const setSelectedId = vi.fn();
    const newList = makeList([2, 3]);
    const reloadList = vi.fn().mockResolvedValue(newList);

    const { result } = renderHook(() =>
      useApprovalCenterActions({
        selectedId: 1,
        setSelectedId,
        currentList: makeList([1, 2, 3]),
        reloadList,
        reloadStats: noop,
        reloadDetail: noop,
      }),
    );

    // 先设置转交用户
    act(() => {
      result.current.transfer.setUserId(99);
    });

    await act(async () => {
      await result.current.handleTransfer();
    });

    expect(oaApi.transfer).toHaveBeenCalledWith(1, { transferToUserId: 99 });
    expect(setSelectedId).toHaveBeenCalledWith(2);
  });

  it('撤回操作不触发自动跳转（保持原有行为）', async () => {
    const setSelectedId = vi.fn();
    const reloadList = vi.fn().mockResolvedValue(makeList([2, 3]));

    const { result } = renderHook(() =>
      useApprovalCenterActions({
        selectedId: 1,
        setSelectedId,
        currentList: makeList([1, 2, 3]),
        reloadList,
        reloadStats: noop,
        reloadDetail: noop,
      }),
    );

    await act(async () => {
      await result.current.handleWithdraw();
    });

    expect(oaApi.withdraw).toHaveBeenCalledWith(1);
    expect(reloadList).toHaveBeenCalled();
    // 撤回不调用 setSelectedId（不自动跳转）
    expect(setSelectedId).not.toHaveBeenCalled();
  });

  it('selectedId 为 null 时不执行操作', async () => {
    const setSelectedId = vi.fn();
    const reloadList = vi.fn().mockResolvedValue([]);

    const { result } = renderHook(() =>
      useApprovalCenterActions({
        selectedId: null,
        setSelectedId,
        currentList: [],
        reloadList,
        reloadStats: noop,
        reloadDetail: noop,
      }),
    );

    await act(async () => {
      await result.current.handleApprove();
    });

    expect(oaApi.approve).not.toHaveBeenCalled();
    expect(setSelectedId).not.toHaveBeenCalled();
  });
});
