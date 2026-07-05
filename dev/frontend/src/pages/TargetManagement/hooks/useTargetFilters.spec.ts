/**
 * 目标管理筛选 Hook 单元测试
 * @module pages/TargetManagement/hooks/useTargetFilters.spec.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock umi useSearchParams
const mockSearchParams = new URLSearchParams();
const mockSetSearchParams = vi.fn((updater: any) => {
  const next = typeof updater === 'function' ? updater(mockSearchParams) : updater;
  // Apply changes to mockSearchParams
  for (const [key, value] of next.entries()) {
    mockSearchParams.set(key, value);
  }
  // Remove keys not in next
  for (const key of Array.from(mockSearchParams.keys())) {
    if (!next.has(key)) mockSearchParams.delete(key);
  }
});

vi.mock('umi', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

import { useTargetFilters } from './useTargetFilters';
import dayjs from 'dayjs';

beforeEach(() => {
  // Reset search params between tests
  for (const key of Array.from(mockSearchParams.keys())) {
    mockSearchParams.delete(key);
  }
  mockSetSearchParams.mockClear();
});

describe('useTargetFilters', () => {
  describe('月份导航', () => {
    it('初始月份为当前月份', () => {
      const { result } = renderHook(() => useTargetFilters());
      expect(result.current.currentMonth.year).toBe(dayjs().year());
      expect(result.current.currentMonth.month).toBe(dayjs().month() + 1);
    });

    it('handlePrevMonth 正确递减月份', () => {
      const { result } = renderHook(() => useTargetFilters());
      const initial = result.current.currentMonth;

      act(() => { result.current.handlePrevMonth(); });

      const expected = dayjs(`${initial.year}-${String(initial.month).padStart(2, '0')}-01`).subtract(1, 'month');
      // 如果目标月份早于 MIN(2026-7)，则不会变化
      if (expected.year() > 2026 || (expected.year() === 2026 && expected.month() + 1 >= 7)) {
        expect(result.current.currentMonth.year).toBe(expected.year());
        expect(result.current.currentMonth.month).toBe(expected.month() + 1);
      } else {
        // 不能前移，保持不变
        expect(result.current.currentMonth).toEqual(initial);
      }
    });

    it('handleNextMonth 正确递增月份', () => {
      const { result } = renderHook(() => useTargetFilters());
      const initial = result.current.currentMonth;

      act(() => { result.current.handleNextMonth(); });

      const expected = dayjs(`${initial.year}-${String(initial.month).padStart(2, '0')}-01`).add(1, 'month');
      expect(result.current.currentMonth.year).toBe(expected.year());
      expect(result.current.currentMonth.month).toBe(expected.month() + 1);
    });

    it('不能切换到早于 2026-07 的月份', () => {
      // 先切换到 2026-08，再前移应到 2026-07，再前移应保持不变
      const { result } = renderHook(() => useTargetFilters());

      // 强制设置为 2026-08
      act(() => {
        result.current.handlePrevMonth(); // 如果当前月份大于 2026-08，会递减
      });

      // 连续前移直到最小月份
      for (let i = 0; i < 24; i++) {
        act(() => { result.current.handlePrevMonth(); });
      }

      // 应该停在 MIN_YEAR=2026, MIN_MONTH=7
      expect(result.current.currentMonth.year).toBeGreaterThanOrEqual(2026);
      if (result.current.currentMonth.year === 2026) {
        expect(result.current.currentMonth.month).toBeGreaterThanOrEqual(7);
      }
      expect(result.current.canPrevMonth).toBe(false);
    });

    it('canPrevMonth 在最小月份时为 false', () => {
      const { result } = renderHook(() => useTargetFilters());

      // 移动到最小月份
      for (let i = 0; i < 24; i++) {
        act(() => { result.current.handlePrevMonth(); });
      }

      expect(result.current.canPrevMonth).toBe(false);
    });
  });

  describe('isHistoryMonth', () => {
    it('当前月份时 isHistoryMonth=false', () => {
      const { result } = renderHook(() => useTargetFilters());
      expect(result.current.isHistoryMonth).toBe(false);
    });

    it('过去月份时 isHistoryMonth=true', () => {
      const { result } = renderHook(() => useTargetFilters());

      // 移动到过去月份
      act(() => { result.current.handlePrevMonth(); });

      // 如果成功移动到了过去月份
      const now = dayjs();
      const selected = dayjs(`${result.current.currentMonth.year}-${String(result.current.currentMonth.month).padStart(2, '0')}`);
      if (selected.isBefore(now, 'month')) {
        expect(result.current.isHistoryMonth).toBe(true);
      }
    });
  });

  describe('营销师/客户选择', () => {
    it('初始 selectedMarketerId=null', () => {
      const { result } = renderHook(() => useTargetFilters());
      expect(result.current.selectedMarketerId).toBeNull();
    });

    it('setSelectedMarketerId 更新 URL 参数', () => {
      const { result } = renderHook(() => useTargetFilters());

      act(() => { result.current.setSelectedMarketerId(100); });
      expect(mockSetSearchParams).toHaveBeenCalled();
    });

    it('setSelectedCustomerId 更新 URL 参数', () => {
      const { result } = renderHook(() => useTargetFilters());

      act(() => { result.current.setSelectedCustomerId(200); });
      expect(mockSetSearchParams).toHaveBeenCalled();
    });
  });
});
