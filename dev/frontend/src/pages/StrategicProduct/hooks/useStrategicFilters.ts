/**
 * 战略商品 - 筛选状态管理 Hook
 */
import { useState, useCallback } from 'react';
import type { StrategicProductStatus } from '@/types/strategic-product';

export interface StrategicFilters {
  page: number;
  pageSize: number;
  keyword: string;
  statusFilter: StrategicProductStatus | undefined;
}

export function useStrategicFilters() {
  const [filters, setFilters] = useState<StrategicFilters>({
    page: 1,
    pageSize: 10,
    keyword: '',
    statusFilter: undefined,
  });

  const setPage = useCallback((page: number) => {
    setFilters((s) => ({ ...s, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setFilters((s) => ({ ...s, pageSize, page: 1 }));
  }, []);

  const setKeyword = useCallback((keyword: string) => {
    setFilters((s) => ({ ...s, keyword, page: 1 }));
  }, []);

  const setStatusFilter = useCallback((statusFilter: StrategicProductStatus | undefined) => {
    setFilters((s) => ({ ...s, statusFilter, page: 1 }));
  }, []);

  return {
    filters,
    setPage,
    setPageSize,
    setKeyword,
    setStatusFilter,
  };
}
