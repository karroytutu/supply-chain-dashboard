/**
 * 审批中心 - 筛选状态管理 Hook
 * 管理筛选条件、分页、URL 同步、移动端视图
 *
 * 状态持久化到 URL，刷新后保留，支持分享
 */
import { useState, useCallback } from 'react';
import { useSearchParams } from 'umi';
import { useMobileDetect } from '@/pages/ProcurementReturn/Orders/hooks/useMobileDetect';
import type { ViewMode } from '@/types/oa-approval';

export function useApprovalCenterFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMobileDetect();
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  const viewMode = (searchParams.get('tab') || 'pending') as ViewMode;
  const page = parseInt(searchParams.get('page') || '1');
  const searchText = searchParams.get('keyword') || '';
  const selectedId = searchParams.get('selectedId')
    ? Number(searchParams.get('selectedId'))
    : null;

  /** 更新 URL 参数（保留其他参数） */
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next: Record<string, string> = {};
      searchParams.forEach((v, k) => {
        next[k] = v;
      });
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
          delete next[key];
        } else {
          next[key] = value;
        }
      });
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  /** 切换视图模式（原子更新 tab + page + selectedId，避免多次 setSearchParams 竞态） */
  const switchViewMode = useCallback(
    (mode: ViewMode) => {
      updateParams({ tab: mode, page: '1', selectedId: null });
    },
    [updateParams],
  );

  const setPage = (p: number) => {
    updateParams({ page: String(p) });
  };

  const setSearchText = (text: string) => {
    updateParams({ keyword: text || null, page: '1' });
  };

  const setSelectedId = (id: number | null) => {
    updateParams({ selectedId: id != null ? String(id) : null });
  };

  return {
    viewMode, page, searchText, selectedId,
    isMobile, mobileView,
    switchViewMode, setPage, setSearchText, setSelectedId, setMobileView,
  };
}
