/**
 * useApprovalCenterFilters Hook 单元测试
 * 覆盖：URL searchParams 解析、switchViewMode 原子更新、setSearchText/setPage/setSelectedId、默认值
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ==================== Mocks ====================

const { mockSearchParams, mockSetSearchParams } = vi.hoisted(() => {
  const store = new Map<string, string>();

  const mockSearchParams = {
    get: (key: string) => store.get(key) ?? null,
    forEach: (cb: (value: string, key: string) => void) => store.forEach(cb),
    _store: store, // 测试辅助直接操作
  };

  const mockSetSearchParams = vi.fn((next: Record<string, string>) => {
    store.clear();
    Object.entries(next).forEach(([k, v]) => store.set(k, v));
  });

  return { mockSearchParams, mockSetSearchParams };
});

vi.mock('umi', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

vi.mock('@/pages/ProcurementReturn/Orders/hooks/useMobileDetect', () => ({
  useMobileDetect: () => false,
}));

import { useApprovalCenterFilters } from './useApprovalCenterFilters';

// ==================== 测试用例 ====================

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams._store.clear();
});

describe('useApprovalCenterFilters - URL 参数解析', () => {
  it('无 URL 参数 → 使用默认值（pending / page=1 / 空搜索）', () => {
    const { result } = renderHook(() => useApprovalCenterFilters());

    expect(result.current.viewMode).toBe('pending');
    expect(result.current.page).toBe(1);
    expect(result.current.searchText).toBe('');
    expect(result.current.selectedId).toBeNull();
  });

  it('有 URL 参数 → 正确解析 tab/page/keyword/selectedId', () => {
    mockSearchParams._store.set('tab', 'processed');
    mockSearchParams._store.set('page', '3');
    mockSearchParams._store.set('keyword', '张三');
    mockSearchParams._store.set('selectedId', '42');

    const { result } = renderHook(() => useApprovalCenterFilters());

    expect(result.current.viewMode).toBe('processed');
    expect(result.current.page).toBe(3);
    expect(result.current.searchText).toBe('张三');
    expect(result.current.selectedId).toBe(42);
  });

  it('isMobile 默认为 false', () => {
    const { result } = renderHook(() => useApprovalCenterFilters());

    expect(result.current.isMobile).toBe(false);
    expect(result.current.mobileView).toBe('list');
  });
});

describe('useApprovalCenterFilters - switchViewMode', () => {
  it('切换视图 → 原子更新 tab + page=1 + 移除 selectedId', () => {
    mockSearchParams._store.set('tab', 'pending');
    mockSearchParams._store.set('page', '5');
    mockSearchParams._store.set('selectedId', '10');

    const { result } = renderHook(() => useApprovalCenterFilters());

    act(() => {
      result.current.switchViewMode('my');
    });

    // setSearchParams 被调用，包含 tab=my, page=1，不包含 selectedId
    expect(mockSetSearchParams).toHaveBeenCalled();
    const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1][0];
    expect(lastCall.tab).toBe('my');
    expect(lastCall.page).toBe('1');
    expect(lastCall.selectedId).toBeUndefined();
  });
});

describe('useApprovalCenterFilters - setPage', () => {
  it('setPage(3) → 更新 page 参数', () => {
    const { result } = renderHook(() => useApprovalCenterFilters());

    act(() => {
      result.current.setPage(3);
    });

    const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1][0];
    expect(lastCall.page).toBe('3');
  });
});

describe('useApprovalCenterFilters - setSearchText', () => {
  it('setSearchText("关键词") → 设置 keyword + page=1', () => {
    const { result } = renderHook(() => useApprovalCenterFilters());

    act(() => {
      result.current.setSearchText('关键词');
    });

    const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1][0];
    expect(lastCall.keyword).toBe('关键词');
    expect(lastCall.page).toBe('1');
  });

  it('setSearchText("") → 移除 keyword + page=1', () => {
    mockSearchParams._store.set('keyword', '旧搜索');

    const { result } = renderHook(() => useApprovalCenterFilters());

    act(() => {
      result.current.setSearchText('');
    });

    const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1][0];
    expect(lastCall.keyword).toBeUndefined();
    expect(lastCall.page).toBe('1');
  });
});

describe('useApprovalCenterFilters - setSelectedId', () => {
  it('setSelectedId(42) → 设置 selectedId=42', () => {
    const { result } = renderHook(() => useApprovalCenterFilters());

    act(() => {
      result.current.setSelectedId(42);
    });

    const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1][0];
    expect(lastCall.selectedId).toBe('42');
  });

  it('setSelectedId(null) → 移除 selectedId', () => {
    mockSearchParams._store.set('selectedId', '10');

    const { result } = renderHook(() => useApprovalCenterFilters());

    act(() => {
      result.current.setSelectedId(null);
    });

    const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1][0];
    expect(lastCall.selectedId).toBeUndefined();
  });
});

describe('useApprovalCenterFilters - 保留其他 URL 参数', () => {
  it('updateParams 保留已有的其他参数', () => {
    mockSearchParams._store.set('tab', 'pending');
    mockSearchParams._store.set('customParam', 'hello');

    const { result } = renderHook(() => useApprovalCenterFilters());

    act(() => {
      result.current.setPage(2);
    });

    const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1][0];
    expect(lastCall.customParam).toBe('hello');
    expect(lastCall.tab).toBe('pending');
    expect(lastCall.page).toBe('2');
  });
});
