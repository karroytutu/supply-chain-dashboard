/**
 * 流程中心 - 筛选状态管理 Hook
 * 管理筛选条件、分页、URL 同步、移动端视图
 *
 * 状态持久化到 URL，刷新后保留，支持分享
 */
import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'umi';
import type { Dayjs } from 'dayjs';
import { useMobileDetect } from '@/hooks/useMobileDetect';
import type { ViewMode } from '@/types/oa';

/** 合法的审批状态枚举，用于 URL 参数防御性校验 */
const VALID_CENTER_STATUSES: ReadonlySet<string> = new Set<string>([
  'pending', 'approved', 'rejected', 'withdrawn', 'cancelled',
]);

export function useApprovalCenterFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMobileDetect();
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [filterOpen, setFilterOpen] = useState(false);

  const viewMode = (searchParams.get('tab') || 'pending') as ViewMode;
  const page = parseInt(searchParams.get('page') || '1');
  const searchText = searchParams.get('keyword') || '';
  const selectedId = searchParams.get('selectedId')
    ? Number(searchParams.get('selectedId'))
    : null;

  // 筛选维度（从 URL 读取，空值回退为 null）
  const formTypeCode = searchParams.get('formType') || null;
  const statusRaw = searchParams.get('status');
  const status = statusRaw && VALID_CENTER_STATUSES.has(statusRaw) ? statusRaw : null;
  const startDate = searchParams.get('startDate') || null;
  const endDate = searchParams.get('endDate') || null;
  const applicantName = searchParams.get('applicant') || null;

  const activeFilterCount = useMemo(() => {
    return [
      formTypeCode,
      status,
      startDate && endDate, // 日期范围作为一个整体计数
      applicantName,
    ].filter(Boolean).length;
  }, [formTypeCode, status, startDate, endDate, applicantName]);

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

  // 筛选维度 setter
  const setFormTypeCode = useCallback((val: string | undefined) => {
    updateParams({ formType: val || null, page: '1' });
  }, [updateParams]);

  const setStatus = useCallback((val: string | undefined) => {
    updateParams({ status: val || null, page: '1' });
  }, [updateParams]);

  const setDateRange = useCallback((dates: [Dayjs, Dayjs] | null) => {
    if (!dates) {
      updateParams({ startDate: null, endDate: null, page: '1' });
    } else {
      updateParams({
        startDate: dates[0].format('YYYY-MM-DD'),
        endDate: dates[1].format('YYYY-MM-DD'),
        page: '1',
      });
    }
  }, [updateParams]);

  const setApplicantName = useCallback((val: string | undefined) => {
    updateParams({ applicant: val || null, page: '1' });
  }, [updateParams]);

  /** 清空所有筛选维度（保留 tab 和 keyword） */
  const clearFilters = useCallback(() => {
    updateParams({
      formType: null,
      status: null,
      startDate: null,
      endDate: null,
      applicant: null,
      page: '1',
    });
  }, [updateParams]);

  const toggleFilterOpen = useCallback(() => {
    setFilterOpen((prev) => !prev);
  }, []);

  return {
    viewMode, page, searchText, selectedId,
    formTypeCode, status, startDate, endDate, applicantName,
    activeFilterCount, filterOpen,
    isMobile, mobileView,
    switchViewMode, setPage, setSearchText, setSelectedId, setMobileView,
    setFormTypeCode, setStatus, setDateRange, setApplicantName,
    clearFilters, toggleFilterOpen,
  };
}
