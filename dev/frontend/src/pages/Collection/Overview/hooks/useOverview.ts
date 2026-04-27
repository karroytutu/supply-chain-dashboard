/**
 * 催收总览页面数据管理 Hook
 * 组合 useCollectionFilters + useCollectionData
 */
import { useCollectionFilters } from './useCollectionFilters';
import { useCollectionData } from './useCollectionData';

export function useOverview() {
  const {
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
  } = useCollectionFilters();

  const {
    stats,
    tasks,
    warningSummary,
    handlers,
    loading,
    statsLoading,
    total,
    refresh,
  } = useCollectionData(filters, dateRangeKey, buildQueryParams);

  return {
    stats,
    tasks,
    warningSummary,
    handlers,
    loading,
    statsLoading,
    total,
    isAdmin,
    userRole,
    refresh,
    // 筛选状态
    ...filters,
    // 筛选操作
    setStatusTab,
    setSearchKeyword,
    setPage,
    setPageSize,
    setHandlerId,
    setDateRange,
    clearAllFilters,
  };
}

export default useOverview;

// 重新导出类型，保持向后兼容
export type { RoleView, StatusTab, EscalationTab } from './useCollectionFilters';
