/**
 * 战略商品数据管理 Hook（组合入口）
 * 组合 useStrategicFilters + useStrategicData + useStrategicActions
 */
import { useState } from 'react';
import { useStrategicFilters } from './useStrategicFilters';
import { useStrategicData } from './useStrategicData';
import { useStrategicActions } from './useStrategicActions';

export function useStrategicProducts() {
  const { filters, setPage, setPageSize, setKeyword, setStatusFilter } = useStrategicFilters();
  const { loading, dataSource, total, stats, loadStats, loadStrategicProducts } = useStrategicData(filters);

  // 选择状态（UI State，不放入 actions）
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  const {
    batchLoading, syncLoading, exportLoading,
    handleDelete, handleConfirm, handleBatchConfirm,
    handleBatchDelete, handleSyncCategory, handleExport,
  } = useStrategicActions({
    filters, dataSource, selectedRowKeys, selectAll,
    setSelectedRowKeys, setSelectAll,
  });

  return {
    loading,
    dataSource,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    keyword: filters.keyword,
    statusFilter: filters.statusFilter,
    stats,
    selectedRowKeys,
    batchLoading,
    selectAll,
    syncLoading,
    exportLoading,
    setPage,
    setPageSize,
    setKeyword,
    setStatusFilter,
    setSelectedRowKeys,
    setSelectAll,
    loadStats,
    loadStrategicProducts,
    handleDelete,
    handleConfirm,
    handleBatchConfirm,
    handleBatchDelete,
    handleSyncCategory,
    handleExport,
  };
}
