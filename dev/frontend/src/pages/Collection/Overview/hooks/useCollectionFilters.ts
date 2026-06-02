/**
 * 催收总览 - 筛选状态管理 Hook
 * 管理筛选条件、分页、URL 同步
 * 状态持久化到 URL，刷新后保留，支持分享
 *
 * 工具函数与类型定义 → collectionFilterUtils.ts
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'umi';
import dayjs from 'dayjs';
import type { CollectionTaskQueryParams } from '@/types/ar-collection';
import { usePermission } from '@/hooks/usePermission';
import { ROLES } from '@/constants/permissions';
import {
  tabToApiParams,
  getCollectionRole,
  getDefaultStatusTab,
} from './collectionFilterUtils';
import type { StatusTab, CollectionFilters } from './collectionFilterUtils';

export type { RoleView, EscalationTab, StatusTab, CollectionFilters } from './collectionFilterUtils';
export { tabToApiParams, getCollectionRole } from './collectionFilterUtils';

export function useCollectionFilters() {
  const { hasAnyRole, roles } = usePermission();
  const isAdmin = hasAnyRole([ROLES.ADMIN, ROLES.MANAGER, ROLES.MARKETING_MANAGER, ROLES.MARKETING_SUPERVISOR]);
  const userRole = getCollectionRole(roles);

  const [searchParams, setSearchParams] = useSearchParams();

  // 从 URL 读取筛选条件
  const statusTab = (searchParams.get('tab') || getDefaultStatusTab(userRole)) as StatusTab;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10));
  const searchKeyword = searchParams.get('keyword') || '';
  const handlerIdRaw = searchParams.get('handlerId');
  const handlerId = handlerIdRaw ? parseInt(handlerIdRaw, 10) : null;
  const startDateStr = searchParams.get('startDate') || '';
  const endDateStr = searchParams.get('endDate') || '';

  const dateRange = useMemo(() => {
    if (!startDateStr && !endDateStr) return null;
    return [
      startDateStr ? dayjs(startDateStr) : null,
      endDateStr ? dayjs(endDateStr) : null,
    ] as [dayjs.Dayjs | null, dayjs.Dayjs | null];
  }, [startDateStr, endDateStr]);

  const filters = useMemo<CollectionFilters>(
    () => ({ page, pageSize, statusTab, searchKeyword, handlerId, dateRange }),
    [page, pageSize, statusTab, searchKeyword, handlerId, dateRange],
  );

  const dateRangeKey = useMemo(() => {
    if (!startDateStr || !endDateStr) return '';
    return `${startDateStr}_${endDateStr}`;
  }, [startDateStr, endDateStr]);

  const buildQueryParams = useCallback((): CollectionTaskQueryParams => {
    const params: CollectionTaskQueryParams = { page, pageSize };
    const { status, escalationLevel } = tabToApiParams(statusTab);
    params.status = status;
    if (escalationLevel !== undefined) params.escalationLevel = escalationLevel;
    if (searchKeyword) params.keyword = searchKeyword;
    if (handlerId) params.handlerId = handlerId;
    if (startDateStr && endDateStr) {
      params.startDate = startDateStr;
      params.endDate = endDateStr;
    }
    if (!isAdmin) params.tab = 'mine';
    return params;
  }, [page, pageSize, statusTab, searchKeyword, handlerId, startDateStr, endDateStr, isAdmin]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next: Record<string, string> = {};
      searchParams.forEach((v, k) => { next[k] = v; });
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

  const setStatusTab = useCallback((tab: StatusTab) => updateParams({ tab, page: '1' }), [updateParams]);
  const setSearchKeyword = useCallback((keyword: string) => updateParams({ keyword: keyword || null, page: '1' }), [updateParams]);
  const setPage = useCallback((p: number) => updateParams({ page: String(p) }), [updateParams]);
  const setPageSize = useCallback((ps: number) => updateParams({ pageSize: String(ps), page: '1' }), [updateParams]);
  const setHandlerId = useCallback((id: number | null) => updateParams({ handlerId: id !== null ? String(id) : null, page: '1' }), [updateParams]);
  const setDateRange = useCallback((range: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => updateParams({
    startDate: range?.[0]?.format('YYYY-MM-DD') || null,
    endDate: range?.[1]?.format('YYYY-MM-DD') || null,
    page: '1',
  }), [updateParams]);
  const clearAllFilters = useCallback(() => updateParams({ keyword: null, handlerId: null, startDate: null, endDate: null, page: '1' }), [updateParams]);

  return {
    filters, dateRangeKey, buildQueryParams, isAdmin, userRole,
    setStatusTab, setSearchKeyword, setPage, setPageSize, setHandlerId, setDateRange, clearAllFilters,
  };
}
