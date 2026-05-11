/**
 * 催收总览 - 筛选状态管理 Hook
 * 管理筛选条件、分页、URL 同步
 *
 * 状态持久化到 URL，刷新后保留，支持分享
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'umi';
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
  if (roles.includes(ROLES.ADMIN) || roles.includes(ROLES.MANAGER) || roles.includes(ROLES.MARKETING_MANAGER)) return 'admin';
  // 兼容历史遗留角色编码，当前业务口径统一收敛到营销经理。
  if (roles.includes(ROLES.MARKETING_SUPERVISOR)) return 'admin';
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

  /** 日期范围（从 URL 字符串反序列化） */
  const dateRange = useMemo(() => {
    if (!startDateStr && !endDateStr) return null;
    return [
      startDateStr ? dayjs(startDateStr) : null,
      endDateStr ? dayjs(endDateStr) : null,
    ] as [dayjs.Dayjs | null, dayjs.Dayjs | null];
  }, [startDateStr, endDateStr]);

  /** 聚合筛选状态（兼容旧接口） */
  const filters = useMemo<CollectionFilters>(
    () => ({
      page,
      pageSize,
      statusTab,
      searchKeyword,
      handlerId,
      dateRange,
    }),
    [page, pageSize, statusTab, searchKeyword, handlerId, dateRange],
  );

  /** 日期范围缓存键（用于数据依赖检测） */
  const dateRangeKey = useMemo(() => {
    if (!startDateStr || !endDateStr) return '';
    return `${startDateStr}_${endDateStr}`;
  }, [startDateStr, endDateStr]);

  /** 构建查询参数 */
  const buildQueryParams = useCallback((): CollectionTaskQueryParams => {
    const params: CollectionTaskQueryParams = {
      page,
      pageSize,
    };
    const { status, escalationLevel } = tabToApiParams(statusTab);
    params.status = status;
    if (escalationLevel !== undefined) {
      params.escalationLevel = escalationLevel;
    }
    if (searchKeyword) {
      params.keyword = searchKeyword;
    }
    if (handlerId) {
      params.handlerId = handlerId;
    }
    if (startDateStr && endDateStr) {
      params.startDate = startDateStr;
      params.endDate = endDateStr;
    }
    if (!isAdmin) {
      params.tab = 'mine';
    }
    return params;
  }, [page, pageSize, statusTab, searchKeyword, handlerId, startDateStr, endDateStr, isAdmin]);

  /**
   * 更新 URL 参数（保留其他参数）
   */
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

  const setStatusTab = useCallback(
    (tab: StatusTab) => {
      updateParams({ tab, page: '1' });
    },
    [updateParams],
  );

  const setSearchKeyword = useCallback(
    (keyword: string) => {
      updateParams({ keyword: keyword || null, page: '1' });
    },
    [updateParams],
  );

  const setPage = useCallback(
    (p: number) => {
      updateParams({ page: String(p) });
    },
    [updateParams],
  );

  const setPageSize = useCallback(
    (ps: number) => {
      updateParams({ pageSize: String(ps), page: '1' });
    },
    [updateParams],
  );

  const setHandlerId = useCallback(
    (id: number | null) => {
      updateParams({ handlerId: id !== null ? String(id) : null, page: '1' });
    },
    [updateParams],
  );

  const setDateRange = useCallback(
    (range: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
      updateParams({
        startDate: range?.[0]?.format('YYYY-MM-DD') || null,
        endDate: range?.[1]?.format('YYYY-MM-DD') || null,
        page: '1',
      });
    },
    [updateParams],
  );

  const clearAllFilters = useCallback(() => {
    updateParams({
      keyword: null,
      handlerId: null,
      startDate: null,
      endDate: null,
      page: '1',
    });
  }, [updateParams]);

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
