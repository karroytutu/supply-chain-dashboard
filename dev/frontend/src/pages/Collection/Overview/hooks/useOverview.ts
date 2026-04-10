/**
 * 催收总览页面数据管理 Hook
 * 管理列表页所有数据状态和操作
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getCollectionStats,
  getCollectionTasks,
  getMyTasks,
  getHandlers,
  getUpcomingWarnings,
} from '@/services/api/ar-collection';
import type {
  CollectionStats,
  CollectionTask,
  CollectionTaskStatus,
  MyTasksSummary,
  CollectionTaskQueryParams,
  Handler,
  WarningSummary,
} from '@/types/ar-collection';
import { usePermission } from '@/hooks/usePermission';
import { ROLES } from '@/constants/permissions';

/** 角色类型 */
export type RoleView = 'marketer' | 'supervisor' | 'finance' | 'cashier' | 'admin';

/**
 * 根据用户真实角色映射到催收业务角色视图
 * @param roles 用户角色列表
 * @returns 催收业务角色
 */
function getCollectionRole(roles: string[]): RoleView {
  if (roles.includes(ROLES.ADMIN) || roles.includes(ROLES.MANAGER)) return 'admin';
  if (roles.includes(ROLES.MARKETING_SUPERVISOR)) return 'supervisor';
  if (roles.includes(ROLES.FINANCE_STAFF)) return 'finance';
  if (roles.includes(ROLES.CASHIER)) return 'cashier';
  return 'marketer'; // operator 或其他默认营销师
}

/** 快捷筛选类型 */
export type QuickFilter = 'urgent' | 'expireToday' | 'timeout' | null;

/** Tab 状态 */
export type StatusTab = 'all' | CollectionTaskStatus;

interface OverviewState {
  stats: CollectionStats | null;
  tasks: CollectionTask[];
  myTasks: MyTasksSummary | null;
  warningSummary: WarningSummary | null;
  handlers: Handler[];
  loading: boolean;
  statsLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
  statusTab: StatusTab;
  quickFilter: QuickFilter;
  searchKeyword: string;
  metricFilter: string | null;
  handlerId: number | null;
  selectedRowKeys: number[];
  selectedRows: CollectionTask[];
}

export function useOverview() {
  const { hasAnyRole, roles } = usePermission();
  const isAdmin = hasAnyRole([ROLES.ADMIN, ROLES.MANAGER]);
  
  // 获取用户真实角色并映射到催收业务角色
  const userRole = getCollectionRole(roles);

  const [state, setState] = useState<OverviewState>({
    stats: null,
    tasks: [],
    myTasks: null,
    warningSummary: null,
    handlers: [],
    loading: false,
    statsLoading: false,
    total: 0,
    page: 1,
    pageSize: 10,
    statusTab: 'all',
    quickFilter: null,
    searchKeyword: '',
    metricFilter: null,
    handlerId: null,
    selectedRowKeys: [],
    selectedRows: [],
  });

  /** 构建查询参数 */
  const buildQueryParams = useCallback((): CollectionTaskQueryParams => {
    const params: CollectionTaskQueryParams = {
      page: state.page,
      pageSize: state.pageSize,
    };
    if (state.statusTab !== 'all') {
      params.status = state.statusTab as CollectionTaskStatus;
    }
    if (state.searchKeyword) {
      params.keyword = state.searchKeyword;
    }
    if (state.handlerId) {
      params.handlerId = state.handlerId;
    }
    // 非管理员只看自己的任务
    if (!isAdmin) {
      params.tab = 'mine';
    }
    return params;
  }, [state.page, state.pageSize, state.statusTab, state.searchKeyword, state.handlerId, isAdmin]);

  /** 加载统计数据 */
  const fetchStats = useCallback(async () => {
    setState((s) => ({ ...s, statsLoading: true }));
    try {
      const data = await getCollectionStats();
      setState((s) => ({ ...s, stats: data, statsLoading: false }));
    } catch {
      setState((s) => ({ ...s, statsLoading: false }));
    }
  }, []);

  /** 加载任务列表 */
  const fetchTasks = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const params = buildQueryParams();
      const result = await getCollectionTasks(params);
      setState((s) => ({
        ...s,
        tasks: result.data,
        total: result.total,
        loading: false,
      }));
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [buildQueryParams]);

  /** 加载我的待办 */
  const fetchMyTasks = useCallback(async () => {
    // 管理员不显示待办面板
    if (userRole === 'admin') return;
    try {
      const data = await getMyTasks();
      setState((s) => ({ ...s, myTasks: data }));
    } catch {
      // 静默处理
    }
  }, [userRole]);

  /** 加载处理人列表 */
  const fetchHandlers = useCallback(async () => {
    try {
      const data = await getHandlers();
      setState((s) => ({ ...s, handlers: data }));
    } catch {
      // 静默处理
    }
  }, []);

  /** 加载预警汇总数据 */
  const fetchWarningSummary = useCallback(async () => {
    try {
      const data = await getUpcomingWarnings();
      setState((s) => ({ ...s, warningSummary: data.summary }));
    } catch {
      // 静默处理
    }
  }, []);

  /** 刷新所有数据 */
  const refresh = useCallback(() => {
    fetchStats();
    fetchTasks();
    fetchMyTasks();
    fetchWarningSummary();
  }, [fetchStats, fetchTasks, fetchMyTasks, fetchWarningSummary]);

  /** 初始加载 */
  useEffect(() => {
    fetchStats();
    fetchMyTasks();
    fetchHandlers();
    fetchWarningSummary();
  }, []);

  /** 参数变化时重新加载列表 */
  useEffect(() => {
    fetchTasks();
  }, [state.page, state.pageSize, state.statusTab, state.searchKeyword, state.handlerId]);

  /** 切换状态 Tab */
  const setStatusTab = useCallback((tab: StatusTab) => {
    setState((s) => ({ ...s, statusTab: tab, page: 1, metricFilter: null }));
  }, []);

  /** 设置搜索关键词 */
  const setSearchKeyword = useCallback((keyword: string) => {
    setState((s) => ({ ...s, searchKeyword: keyword, page: 1 }));
  }, []);

  /** 设置快捷筛选 */
  const setQuickFilter = useCallback((filter: QuickFilter) => {
    setState((s) => ({
      ...s,
      quickFilter: s.quickFilter === filter ? null : filter,
      page: 1,
    }));
  }, []);

  /** 设置指标卡筛选 */
  const setMetricFilter = useCallback((metric: string | null) => {
    setState((s) => ({
      ...s,
      metricFilter: s.metricFilter === metric ? null : metric,
      page: 1,
    }));
  }, []);

  /** 设置分页 */
  const setPage = useCallback((page: number) => {
    setState((s) => ({ ...s, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setState((s) => ({ ...s, pageSize, page: 1 }));
  }, []);

  /** 设置处理人筛选 */
  const setHandlerId = useCallback((handlerId: number | null) => {
    setState((s) => ({ ...s, handlerId, page: 1 }));
  }, []);

  /** 设置选中行 */
  const setSelection = useCallback((keys: number[], rows: CollectionTask[]) => {
    setState((s) => ({ ...s, selectedRowKeys: keys, selectedRows: rows }));
  }, []);

  /** 清除选中 */
  const clearSelection = useCallback(() => {
    setState((s) => ({ ...s, selectedRowKeys: [], selectedRows: [] }));
  }, []);

  /** 过滤后的任务（前端筛选） */
  const filteredTasks = useMemo(() => {
    let list = state.tasks;
    if (state.quickFilter === 'urgent') {
      list = list.filter((t) => t.priority === 'critical' || t.priority === 'high');
    } else if (state.quickFilter === 'expireToday') {
      list = list.filter((t) => t.status === 'extension');
    } else if (state.quickFilter === 'timeout') {
      list = list.filter((t) => {
        if (!t.lastCollectionAt) return true;
        const diff = Date.now() - new Date(t.lastCollectionAt).getTime();
        return diff > 7 * 24 * 3600 * 1000;
      });
    }
    if (state.metricFilter) {
      if (state.metricFilter === 'collecting') {
        list = list.filter((t) => t.status === 'collecting');
      } else if (state.metricFilter === 'waiting') {
        list = list.filter((t) =>
          ['difference_processing', 'extension', 'escalated'].includes(t.status),
        );
      } else if (state.metricFilter === 'attention') {
        list = list.filter((t) => t.status === 'pending_verify' || t.maxOverdueDays >= 30);
      } else if (state.metricFilter === 'collected') {
        list = list.filter((t) => t.status === 'verified');
      }
    }
    return list;
  }, [state.tasks, state.quickFilter, state.metricFilter]);

  return {
    ...state,
    tasks: filteredTasks,
    allTasks: state.tasks,
    isAdmin,
    userRole,  // 用户真实角色（映射后的催收业务角色）
    refresh,
    setStatusTab,
    setSearchKeyword,
    setQuickFilter,
    setMetricFilter,
    setPage,
    setPageSize,
    setHandlerId,
    setSelection,
    clearSelection,
  };
}

export default useOverview;
