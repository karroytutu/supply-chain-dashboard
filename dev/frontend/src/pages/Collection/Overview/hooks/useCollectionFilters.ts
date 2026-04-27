/**
 * 催收总览 - 筛选状态管理 Hook
 * 管理筛选条件、分页、URL 同步
 */
import { useState, useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import type { CollectionTaskStatus, CollectionTaskQueryParams, EscalationLevel } from '@/types/ar-collection';
import { usePermission } from '@/hooks/usePermission';
import { ROLES } from '@/constants/permissions';

/** 角色类型 */
export type RoleView = 'marketer' | 'supervisor' | 'finance' | 'cashier' | 'admin';

/** 升级子 Tab 类型 */
export type EscalationTab = 'escalated_l1' | 'escalated_l2';

/** 状态 Tab 类型 */
export type StatusTab = Exclude<CollectionTaskStatus, 'escalated'> | EscalationTab;

/** 将 Tab key 映射为 API 查询参数 */
export function tabToApiParams(tab: StatusTab): { status?: CollectionTaskStatus; escalationLevel?: EscalationLevel } {
  if (tab === 'escalated_l1') return { status: 'escalated', escalationLevel: 1 };
  if (tab === 'escalated_l2') return { status: 'escalated', escalationLevel: 2 };
  return { status: tab };
}

/**
 * 根据用户真实角色映射到催收业务角色视图
 */
export function getCollectionRole(roles: string[]): RoleView {
  if (roles.includes(ROLES.ADMIN) || roles.includes(ROLES.MANAGER) || roles.includes(ROLES.MARKETING_MANAGER) || roles.includes(ROLES.MARKETING_SUPERVISOR)) return 'admin';
  if (roles.includes(ROLES.CURRENT_ACCOUNTANT) || roles.includes(ROLES.FINANCE_STAFF)) return 'finance';
  if (roles.includes(ROLES.CASHIER)) return 'cashier';
  if (roles.includes(ROLES.MARKETER)) return 'marketer';
  return 'marketer';
}

/**
 * 根据催收业务角色返回默认状态 Tab
 */
function getDefaultStatusTab(role: RoleView): StatusTab {
  switch (role) {
    case 'cashier':
      return 'pending_verify';
    case 'finance':
      return 'difference_processing';
    case 'supervisor':
      return 'escalated_l1';
    default:
      return 'collecting';
  }
}

export interface CollectionFilters {
  page: number;
  pageSize: number;
  statusTab: StatusTab;
  searchKeyword: string;
  handlerId: number | null;
  dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
}

export function useCollectionFilters() {
  const { hasAnyRole, roles } = usePermission();
  const isAdmin = hasAnyRole([ROLES.ADMIN, ROLES.MANAGER, ROLES.MARKETING_MANAGER, ROLES.MARKETING_SUPERVISOR]);
  const userRole = getCollectionRole(roles);

  const [filters, setFilters] = useState<CollectionFilters>({
    page: 1,
    pageSize: 10,
    statusTab: getDefaultStatusTab(userRole),
    searchKeyword: '',
    handlerId: null,
    dateRange: null,
  });

  const dateRangeKey = useMemo(() => {
    if (!filters.dateRange || !filters.dateRange[0] || !filters.dateRange[1]) {
      return '';
    }
    return `${filters.dateRange[0].format('YYYY-MM-DD')}_${filters.dateRange[1].format('YYYY-MM-DD')}`;
  }, [filters.dateRange]);

  /** 构建查询参数 */
  const buildQueryParams = useCallback((): CollectionTaskQueryParams => {
    const params: CollectionTaskQueryParams = {
      page: filters.page,
      pageSize: filters.pageSize,
    };
    const { status, escalationLevel } = tabToApiParams(filters.statusTab);
    params.status = status;
    if (escalationLevel !== undefined) {
      params.escalationLevel = escalationLevel;
    }
    if (filters.searchKeyword) {
      params.keyword = filters.searchKeyword;
    }
    if (filters.handlerId) {
      params.handlerId = filters.handlerId;
    }
    if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
      params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
      params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
    }
    if (!isAdmin) {
      params.tab = 'mine';
    }
    return params;
  }, [filters.page, filters.pageSize, filters.statusTab, filters.searchKeyword, filters.handlerId, dateRangeKey, isAdmin]);

  const setStatusTab = useCallback((tab: StatusTab) => {
    setFilters((s) => ({ ...s, statusTab: tab, page: 1 }));
  }, []);

  const setSearchKeyword = useCallback((keyword: string) => {
    setFilters((s) => ({ ...s, searchKeyword: keyword, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setFilters((s) => ({ ...s, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setFilters((s) => ({ ...s, pageSize, page: 1 }));
  }, []);

  const setHandlerId = useCallback((handlerId: number | null) => {
    setFilters((s) => ({ ...s, handlerId, page: 1 }));
  }, []);

  const setDateRange = useCallback((dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setFilters((s) => ({ ...s, dateRange, page: 1 }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters((s) => ({
      ...s,
      searchKeyword: '',
      handlerId: null,
      dateRange: null,
      page: 1,
    }));
  }, []);

  return {
    filters,
    dateRangeKey,
    buildQueryParams,
    isAdmin,
    userRole,
    setStatusTab,
    setSearchKeyword,
    setPage,
    setPageSize,
    setHandlerId,
    setDateRange,
    clearAllFilters,
  };
}
