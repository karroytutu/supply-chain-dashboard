/**
 * 用户管理 - 筛选状态 Hook
 */
import { useState, useCallback } from 'react';
import type { UserFilters } from '../types';

/** 默认筛选：仅展示正常用户 */
const DEFAULT_FILTERS: UserFilters = {
  keyword: '',
  departmentId: undefined,
  roleId: undefined,
  status: 1,
};

export function useUserFilters() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFiltersState] = useState<UserFilters>(DEFAULT_FILTERS);
  // 搜索触发器：递增以强制 refetch，解决 setPage(1) 在第1页时无变化的问题
  const [searchVersion, setSearchVersion] = useState(0);

  const setFilters = useCallback((newFilters: Partial<UserFilters>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  }, []);

  const handleSearch = useCallback(() => {
    setPage(1);
    setSearchVersion(v => v + 1);
  }, []);

  const handleReset = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    setPage(1);
    setSearchVersion(v => v + 1);
  }, []);

  const handlePageChange = useCallback((newPage: number, newPageSize: number) => {
    setPage(newPage);
    setPageSize(newPageSize);
  }, []);

  return {
    page,
    pageSize,
    filters,
    searchVersion,
    setFilters,
    setPage,
    setPageSize,
    handleSearch,
    handleReset,
    handlePageChange,
  };
}
