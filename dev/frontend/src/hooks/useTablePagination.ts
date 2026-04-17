/**
 * 表格分页 Hook
 * 封装 Ant Design Table 分页逻辑，减少重复代码
 */
import { useState, useCallback } from 'react';

interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export function useTablePagination(defaultPageSize: number = 20) {
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: defaultPageSize,
    total: 0,
  });

  const setTotal = useCallback((total: number) => {
    setPagination(prev => ({ ...prev, total }));
  }, []);

  const setPage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination(prev => ({ ...prev, pageSize, page: 1 }));
  }, []);

  const reset = useCallback(() => {
    setPagination({ page: 1, pageSize: defaultPageSize, total: 0 });
  }, [defaultPageSize]);

  const tableProps = {
    current: pagination.page,
    pageSize: pagination.pageSize,
    total: pagination.total,
    onChange: (page: number, pageSize: number) => {
      setPagination(prev => ({ ...prev, page, pageSize }));
    },
    showSizeChanger: true,
    showTotal: (total: number) => `共 ${total} 条`,
  };

  return { pagination, setTotal, setPage, setPageSize, reset, tableProps };
}
