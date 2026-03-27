/**
 * 退货单数据管理 Hook
 */
import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import dayjs from 'dayjs';
import {
  getReturnOrders,
  getReturnOrderStats,
  batchConfirmReturnOrders,
  cancelReturnOrder,
} from '@/services/api/procurement-return';
import type {
  ReturnOrder,
  ReturnOrderStats,
  ReturnOrderStatus,
  ReturnOrderQueryParams,
} from '@/types/procurement-return';
import type { PaginatedResult } from '@/types/warning';

const DEFAULT_STATS: ReturnOrderStats = {
  pendingConfirm: 0,
  pendingErpFill: 0,
  pendingWarehouseExecute: 0,
  pendingMarketingSale: 0,
  completed: 0,
  total: 0,
};

export function useReturnOrders() {
  // 列表相关状态
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<ReturnOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReturnOrderStatus | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  // 统计数据
  const [stats, setStats] = useState<ReturnOrderStats>(DEFAULT_STATS);

  // 批量操作相关
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  // 加载统计信息
  const fetchStats = useCallback(async () => {
    try {
      const result = await getReturnOrderStats();
      setStats(result);
    } catch (error) {
      console.error('加载统计信息失败:', error);
    }
  }, []);

  // 加载退货单列表
  const fetchReturnOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: ReturnOrderQueryParams = {
        page,
        pageSize,
        keyword: keyword || undefined,
        status: statusFilter,
      };
      
      // 处理日期范围
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

  // 搜索
  const handleSearch = useCallback(() => {
    setPage(1);
    fetchReturnOrders();
  }, [fetchReturnOrders]);

  // 状态变更
  const handleStatusChange = useCallback((status?: ReturnOrderStatus) => {
    setStatusFilter(status);
    setPage(1);
  }, []);

  // 日期范围变更
  const handleDateRangeChange = useCallback((dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setDateRange(dates);
    setPage(1);
  }, []);

  // 分页变更
  const handlePageChange = useCallback((p: number, ps: number) => {
    setPage(p);
    setPageSize(ps);
  }, []);

  // 批量确认
  const handleBatchConfirm = useCallback(async (canReturn: boolean) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要操作的退货单');
      return false;
    }

    setBatchLoading(true);
    try {
      const result = await batchConfirmReturnOrders({
        orderIds: selectedRowKeys,
        ruleDecision: canReturn ? 'can_return' : 'cannot_return',
      });
      message.success(
        canReturn
          ? `批量确认可退货成功 ${result.successCount} 条`
          : `批量确认不可退货成功 ${result.successCount} 条`
      );
      setSelectedRowKeys([]);
      fetchReturnOrders();
      fetchStats();
      return true;
    } catch (error) {
      message.error('批量操作失败');
      return false;
    } finally {
      setBatchLoading(false);
    }
  }, [selectedRowKeys, fetchReturnOrders, fetchStats]);

  // 取消退货单
  const handleCancel = useCallback(async (id: number, comment?: string) => {
    try {
      await cancelReturnOrder(id, { comment });
      message.success('取消成功');
      fetchReturnOrders();
      fetchStats();
      return true;
    } catch (error) {
      message.error('取消失败');
      return false;
    }
  }, [fetchReturnOrders, fetchStats]);

  // 初始加载
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // 列表数据加载
  useEffect(() => {
    fetchReturnOrders();
  }, [fetchReturnOrders]);

  return {
    // 状态
    loading,
    dataSource,
    total,
    page,
    pageSize,
    keyword,
    statusFilter,
    dateRange,
    stats,
    selectedRowKeys,
    batchLoading,
    // 设置函数
    setKeyword,
    setStatusFilter,
    setDateRange,
    setSelectedRowKeys,
    // 操作函数
    fetchStats,
    fetchReturnOrders,
    handleSearch,
    handleStatusChange,
    handleDateRangeChange,
    handleBatchConfirm,
    handleCancel,
    handlePageChange,
  };
}
