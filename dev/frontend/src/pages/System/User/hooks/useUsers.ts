/**
 * 用户数据管理 Hook（组合入口）
 * 组合 useUserFilters + useUserData + useUserActions
 * 返回值按逻辑分组，避免扁平结构
 */
import { useState, useCallback } from 'react';
import { useUserFilters } from './useUserFilters';
import { useUserData } from './useUserData';
import { useUserActions } from './useUserActions';

export function useUsers() {
  const {
    page, pageSize, filters, activeStatus,
    setFilters, setActiveStatus, setPage,
    handleSearch: searchFilter,
    handleReset: resetFilter,
    handlePageChange,
  } = useUserFilters();

  const {
    loading, dataSource, total, stats, roles, fetchUsers,
  } = useUserData(page, pageSize, filters, activeStatus);

  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

  const {
    batchLoading,
    handleToggleStatus,
    handleBatchEnable,
    handleBatchDisable,
    handleBatchAssignRoles,
  } = useUserActions({ selectedRowKeys, setSelectedRowKeys, fetchUsers });

  const handleSearch = useCallback(() => {
    searchFilter();
    setSelectedRowKeys([]);
  }, [searchFilter]);

  const handleReset = useCallback(() => {
    resetFilter();
    setSelectedRowKeys([]);
  }, [resetFilter]);

  // 按逻辑分组返回（规范要求：超过10个属性必须分组）
  return {
    data: { loading, dataSource, total, stats, roles },
    pagination: { page, pageSize },
    filters: { filters, activeStatus, setFilters, setActiveStatus },
    selection: { selectedRowKeys, setSelectedRowKeys, batchLoading },
    actions: {
      reload: fetchUsers,
      search: handleSearch,
      reset: handleReset,
      pageChange: handlePageChange,
      toggleStatus: handleToggleStatus,
      batch: {
        enable: handleBatchEnable,
        disable: handleBatchDisable,
        assignRoles: handleBatchAssignRoles,
      },
    },
  };
}
