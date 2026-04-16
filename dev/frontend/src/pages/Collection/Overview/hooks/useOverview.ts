/**
 * 催收总览页面数据管理 Hook
 * 管理列表页所有数据状态和操作
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
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
  if (roles.includes(ROLES.MARKETING_MANAGER)) return 'supervisor';
  if (roles.includes(ROLES.CURRENT_ACCOUNTANT) || roles.includes(ROLES.FINANCE_STAFF)) return 'finance';
  if (roles.includes(ROLES.CASHIER)) return 'cashier';
  if (roles.includes(ROLES.MARKETER)) return 'marketer';
  return 'marketer'; // 默认营销师视图
}

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
  searchKeyword: string;
  metricFilter: string | null;
  handlerId: number | null;
  dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
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
    searchKeyword: '',
    metricFilter: null,
    handlerId: null,
    dateRange: null,
    selectedRowKeys: [],
    selectedRows: [],
  });

  // 将日期范围转为字符串作为稳定依赖
  const dateRangeKey = useMemo(() => {
    if (!state.dateRange || !state.dateRange[0] || !state.dateRange[1]) {
      return '';
    }
    return `${state.dateRange[0].format('YYYY-MM-DD')}_${state.dateRange[1].format('YYYY-MM-DD')}`;
  }, [state.dateRange]);

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
    // 日期范围筛选
    if (state.dateRange && state.dateRange[0] && state.dateRange[1]) {
      params.startDate = state.dateRange[0].format('YYYY-MM-DD');
      params.endDate = state.dateRange[1].format('YYYY-MM-DD');
    }
    // 非管理员只看自己的任务
    if (!isAdmin) {
      params.tab = 'mine';
    }
    return params;
  }, [state.page, state.pageSize, state.statusTab, state.searchKeyword, state.handlerId, dateRangeKey, isAdmin]);

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
  }, [state.page, state.pageSize, state.statusTab, state.searchKeyword, state.handlerId, dateRangeKey]);

  /** 切换状态 Tab */
  const setStatusTab = useCallback((tab: StatusTab) => {
    setState((s) => ({ ...s, statusTab: tab, page: 1, metricFilter: null }));
  }, []);

  /** 设置搜索关键词 */
  const setSearchKeyword = useCallback((keyword: string) => {
    setState((s) => ({ ...s, searchKeyword: keyword, page: 1 }));
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

  /** 设置日期范围筛选 */
  const setDateRange = useCallback((dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setState((s) => ({ ...s, dateRange, page: 1 }));
  }, []);

  /** 设置选中行 */
  const setSelection = useCallback((keys: number[], rows: CollectionTask[]) => {
    setState((s) => ({ ...s, selectedRowKeys: keys, selectedRows: rows }));
  }, []);

  /** 清除选中 */
  const clearSelection = useCallback(() => {
    setState((s) => ({ ...s, selectedRowKeys: [], selectedRows: [] }));
  }, []);

  /** 清除所有筛选条件 */
  const clearAllFilters = useCallback(() => {
    setState((s) => ({
      ...s,
      searchKeyword: '',
      handlerId: null,
      dateRange: null,
      metricFilter: null,
      page: 1,
    }));
  }, []);

  /** 过滤后的任务（前端筛选 - 仅指标卡筛选） */
  const filteredTasks = useMemo(() => {
    let list = state.tasks;
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
        list = list.filter((t) => t.status === 'verified' || t.status === 'closed');
      }
    }
    return list;
  }, [state.tasks, state.metricFilter]);

  return {
    ...state,
    tasks: filteredTasks,
    allTasks: state.tasks,
    isAdmin,
    userRole,  // 用户真实角色（映射后的催收业务角色）
    refresh,
    setStatusTab,
    setSearchKeyword,
    setMetricFilter,
    setPage,
    setPageSize,
    setHandlerId,
    setDateRange,
    clearAllFilters,
    setSelection,
    clearSelection,
  };
}

export default useOverview;
