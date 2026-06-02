import { useState, useCallback } from 'react';
import dayjs from 'dayjs';
import type { ReturnOrderStatus } from '@/types/procurement-return';

export interface ReturnOrdersFilters {
  page: number;
  pageSize: number;
  keyword: string;
  statusFilter: ReturnOrderStatus | undefined;
  dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  setKeyword: (keyword: string) => void;
  setStatusFilter: (status?: ReturnOrderStatus) => void;
  setDateRange: (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => void;
  handleSearch: () => void;
  handleStatusChange: (status?: ReturnOrderStatus) => void;
  handleDateRangeChange: (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => void;
  handlePageChange: (p: number, ps: number) => void;
}

export function useReturnOrdersFilters(): ReturnOrdersFilters {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReturnOrderStatus | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const handleSearch = useCallback(() => {
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((status?: ReturnOrderStatus) => {
    setStatusFilter(status);
    setPage(1);
  }, []);

  const handleDateRangeChange = useCallback((dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setDateRange(dates);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((p: number, ps: number) => {
    setPage(p);
    setPageSize(ps);
  }, []);

  return {
    page, pageSize, keyword, statusFilter, dateRange,
    setKeyword, setStatusFilter, setDateRange,
    handleSearch, handleStatusChange, handleDateRangeChange, handlePageChange,
  };
}
