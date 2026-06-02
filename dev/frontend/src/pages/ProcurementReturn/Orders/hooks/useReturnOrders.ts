/**
 * 退货单数据管理 Hook - 组合入口
 * 筛选状态 → useReturnOrdersFilters
 * 数据加载 → useReturnOrdersData
 * 批量操作 → useReturnOrdersActions
 */
import { useReturnOrdersFilters } from './useReturnOrdersFilters';
import { useReturnOrdersData } from './useReturnOrdersData';
import { useReturnOrdersActions } from './useReturnOrdersActions';

export function useReturnOrders() {
  const filters = useReturnOrdersFilters();
  const data = useReturnOrdersData(filters);
  const actions = useReturnOrdersActions(data.dataSource, data.fetchReturnOrders, data.fetchStats);

  return {
    // 筛选状态
    page: filters.page,
    pageSize: filters.pageSize,
    keyword: filters.keyword,
    statusFilter: filters.statusFilter,
    dateRange: filters.dateRange,
    setKeyword: filters.setKeyword,
    setStatusFilter: filters.setStatusFilter,
    setDateRange: filters.setDateRange,
    handleSearch: filters.handleSearch,
    handleStatusChange: filters.handleStatusChange,
    handleDateRangeChange: filters.handleDateRangeChange,
    handlePageChange: filters.handlePageChange,
    // 数据
    loading: data.loading,
    dataSource: data.dataSource,
    total: data.total,
    stats: data.stats,
    fetchStats: data.fetchStats,
    fetchReturnOrders: data.fetchReturnOrders,
    // 操作
    selectedRowKeys: actions.selectedRowKeys,
    batchLoading: actions.batchLoading,
    setSelectedRowKeys: actions.setSelectedRowKeys,
    handleBatchConfirm: actions.handleBatchConfirm,
  };
}
