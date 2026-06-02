import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import dayjs from 'dayjs';
import { getReturnOrders, getReturnOrderStats } from '@/services/api/procurement-return';
import type { ReturnOrder, ReturnOrderStats, ReturnOrderStatus, ReturnOrderQueryParams } from '@/types/procurement-return';
import type { PaginatedResult } from '@/types/warning';

const DEFAULT_STATS: ReturnOrderStats = {
  pendingConfirm: 0, pendingErpFill: 0, pendingWarehouseExecute: 0,
  pendingMarketingSale: 0, completed: 0, total: 0,
};

export interface ReturnOrdersData {
  loading: boolean;
  dataSource: ReturnOrder[];
  total: number;
  stats: ReturnOrderStats;
  fetchStats: () => Promise<void>;
  fetchReturnOrders: () => Promise<void>;
}

export function useReturnOrdersData(filters: {
  page: number;
  pageSize: number;
  keyword: string;
  statusFilter: ReturnOrderStatus | undefined;
  dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
}): ReturnOrdersData {
  const { page, pageSize, keyword, statusFilter, dateRange } = filters;
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<ReturnOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<ReturnOrderStats>(DEFAULT_STATS);

  const fetchStats = useCallback(async () => {
    try {
      const result = await getReturnOrderStats();
      setStats(result);
    } catch (error) {
      console.error('加载统计信息失败:', error);
    }
  }, []);

  const fetchReturnOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: ReturnOrderQueryParams = {
        page, pageSize,
        keyword: keyword || undefined,
        status: statusFilter,
      };
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }
      const result: PaginatedResult<ReturnOrder> = await getReturnOrders(params);
      setDataSource(result.data);
      setTotal(result.total);
    } catch (error) {
      message.error('加载退货单列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, statusFilter, dateRange]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchReturnOrders(); }, [fetchReturnOrders]);

  return { loading, dataSource, total, stats, fetchStats, fetchReturnOrders };
}
