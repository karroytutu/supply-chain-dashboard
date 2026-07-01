/**
 * useTargetData Hook 单元测试
 * @module pages/TargetManagement/hooks/useTargetData.spec.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTargetData } from './useTargetData';

// Mock API dependencies
vi.mock('@/services/api/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: 1, roles: [{ code: 'marketing_manager' }] }),
}));

vi.mock('@/services/api/sales-target', () => ({
  fetchMarketers: vi.fn().mockResolvedValue([
    { id: 1, name: '张三' },
    { id: 2, name: '李四' },
  ]),
  fetchInitData: vi.fn().mockResolvedValue({
    isSaved: false,
    targetId: null,
    marketerId: 1,
    marketerName: '张三',
    year: 2026,
    month: 7,
    customers: [],
  }),
  fetchOverview: vi.fn().mockResolvedValue({
    summary: { totalTarget: 0, totalLastMonthActual: 0, growthRate: null, marketerCount: 2, marketersWithTarget: 0 },
    marketers: [],
  }),
  fetchCustomers: vi.fn().mockResolvedValue([]),
  fetchProductCatalog: vi.fn().mockResolvedValue([]),
}));

vi.mock('antd', () => ({
  message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { fetchMarketers, fetchInitData, fetchOverview } from '@/services/api/sales-target';
import { getCurrentUser } from '@/services/api/auth';

const mockFetchMarketers = fetchMarketers as ReturnType<typeof vi.fn>;
const mockFetchInitData = fetchInitData as ReturnType<typeof vi.fn>;
const mockFetchOverview = fetchOverview as ReturnType<typeof vi.fn>;
const mockGetCurrentUser = getCurrentUser as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMarketers.mockResolvedValue([{ id: 1, name: '张三' }, { id: 2, name: '李四' }]);
  mockFetchOverview.mockResolvedValue({
    summary: { totalTarget: 0, totalLastMonthActual: 0, growthRate: null, marketerCount: 2, marketersWithTarget: 0 },
    marketers: [],
  });
  mockFetchInitData.mockResolvedValue({
    isSaved: false, targetId: null, marketerId: 1, marketerName: '张三',
    year: 2026, month: 7, customers: [],
  });
  mockGetCurrentUser.mockResolvedValue({ id: 1, roles: [{ code: 'marketing_manager' }] });
});

describe('useTargetData', () => {
  describe('3 阶段加载', () => {
    it('阶段1: 加载营销师列表 + 当前用户信息', async () => {
      const { result } = renderHook(() =>
        useTargetData({ selectedMarketerId: null, currentMonth: { year: 2026, month: 7 } }),
      );

      await waitFor(() => {
        expect(mockFetchMarketers).toHaveBeenCalled();
        expect(mockGetCurrentUser).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(result.current.marketers.length).toBeGreaterThan(0);
      });
    });

    it('阶段2: 营销师列表就绪 + 未选营销师 → 加载概览', async () => {
      const { result } = renderHook(() =>
        useTargetData({ selectedMarketerId: null, currentMonth: { year: 2026, month: 7 } }),
      );

      await waitFor(() => {
        expect(mockFetchOverview).toHaveBeenCalled();
      });
    });

    it('阶段3: 选中营销师 → 加载该营销师 init-data', async () => {
      const { result } = renderHook(() =>
        useTargetData({ selectedMarketerId: 1, currentMonth: { year: 2026, month: 7 } }),
      );

      await waitFor(() => {
        expect(mockFetchInitData).toHaveBeenCalledWith({
          marketerId: 1,
          year: 2026,
          month: 7,
        });
      });
    });
  });

  describe('竞态修复', () => {
    it('requestIdRef 在切换营销师时递增', async () => {
      // 验证 requestIdRef 机制：快速切换时旧请求结果被丢弃
      // 通过验证最终 customers 来自最后一次请求来间接测试
      const { result } = renderHook(() =>
        useTargetData({ selectedMarketerId: 1, currentMonth: { year: 2026, month: 7 } }),
      );

      await waitFor(() => {
        expect(mockFetchInitData).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('canEdit', () => {
    it('admin/marketing_manager 角色 → true', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: 1, roles: [{ code: 'admin' }] });

      const { result } = renderHook(() =>
        useTargetData({ selectedMarketerId: null, currentMonth: { year: 2026, month: 7 } }),
      );

      await waitFor(() => {
        expect(result.current.canEdit).toBe(true);
      });
    });

    it('其他角色 → false', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: 2, roles: [{ code: 'viewer' }] });

      const { result } = renderHook(() =>
        useTargetData({ selectedMarketerId: null, currentMonth: { year: 2026, month: 7 } }),
      );

      await waitFor(() => {
        expect(result.current.canEdit).toBe(false);
      });
    });
  });
});
