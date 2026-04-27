/**
 * 用户管理 - 筛选状态 Hook
 */
import { useState, useCallback } from 'react';
import type { UserFilters } from '../types';

export function useUserFilters() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFiltersState] = useState<UserFilters>({
    keyword: '',
    departmentId: undefined,
    roleId: undefined,
    status: undefined,
  });
  const [activeStatus, setActiveStatus] = useState<'active' | 'disabled' | undefined>();

  const setFilters = useCallback((newFilters: Partial<UserFilters>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  }, []);

  const handleSearch = useCallback(() => {
    setPage(1);
  }, []);

  const handleReset = useCallback(() => {
    setFiltersState({
      keyword: '',
      departmentId: undefined,
      roleId: undefined,
      status: undefined,
    });
    setActiveStatus(undefined);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number, newPageSize: number) => {
    setPage(newPage);
    setPageSize(newPageSize);
  }, []);

  return {
    page,
    pageSize,
    filters,
    activeStatus,
    setFilters,
    setActiveStatus,
    setPage,
    setPageSize,
    handleSearch,
    handleReset,
    handlePageChange,
  };
}
