/**
 * 战略商品数据管理 Hook
 */
import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import {
  getStrategicProducts,
  getStrategicProductStats,
  deleteStrategicProduct,
  confirmStrategicProduct,
  batchConfirmStrategicProducts,
  batchDeleteStrategicProducts,
} from '@/services/api/strategic-product';
import type {
  StrategicProduct,
  StrategicProductStats,
  StrategicProductStatus,
} from '@/types/strategic-product';
import type { PaginatedResult } from '@/types/warning';

export function useStrategicProducts() {
  // 列表相关状态
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<StrategicProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<StrategicProductStatus | undefined>();

  // 统计数据
  const [stats, setStats] = useState<StrategicProductStats>({
    total: 0,
    pending: 0,
    confirmed: 0,
    rejected: 0,
  });

  // 批量操作相关
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [selectAll, setSelectAll] = useState(false);

  // 加载统计信息
  const loadStats = useCallback(async () => {
    try {
      const result = await getStrategicProductStats();
      setStats(result);
    } catch (error) {
      console.error('加载统计信息失败:', error);
    }
  }, []);

  // 加载战略商品列表
  const loadStrategicProducts = useCallback(async (
    categoryPath?: string,
    filterStatus?: StrategicProductStatus,
    searchKeyword?: string
  ) => {
    setLoading(true);
    try {
      const result: PaginatedResult<StrategicProduct> = await getStrategicProducts({
        page,
        pageSize,
        keyword: searchKeyword ?? keyword,
        status: filterStatus ?? statusFilter,
        categoryPath,
      });
      setDataSource(result.data);
      setTotal(result.total);
    } catch (error) {
      message.error('加载战略商品列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, statusFilter]);

  // 删除战略商品
  const handleDelete = useCallback(async (id: number) => {
    try {
      await deleteStrategicProduct(id);
      message.success('删除成功');
      return true;
    } catch (error) {
      message.error('删除失败');
      return false;
    }
  }, []);

  // 确认/驳回战略商品
  const handleConfirm = useCallback(async (record: StrategicProduct, confirmed: boolean) => {
    try {
      await confirmStrategicProduct(record.id, { action: confirmed ? 'confirm' : 'reject' });
      message.success(confirmed ? '确认成功' : '驳回成功');
      return true;
    } catch (error) {
      message.error('操作失败');
      return false;
    }
  }, []);

  // 批量确认
  const handleBatchConfirm = useCallback(async (
    action: 'confirm' | 'reject',
    categoryPath?: string
  ) => {
    if (!selectAll && selectedRowKeys.length === 0) {
      message.warning('请选择要操作的商品');
      return false;
    }

    setBatchLoading(true);
    try {
      await batchConfirmStrategicProducts({
        selectAll,
        ids: selectAll ? undefined : selectedRowKeys,
        action,
        status: statusFilter,
        categoryPath,
        keyword,
      });
      message.success(action === 'confirm' ? '批量确认成功' : '批量驳回成功');
      setSelectedRowKeys([]);
      setSelectAll(false);
      return true;
    } catch (error) {
      message.error('批量操作失败');
      return false;
    } finally {
      setBatchLoading(false);
    }
  }, [selectAll, selectedRowKeys, statusFilter, keyword]);

  // 批量删除
  const handleBatchDelete = useCallback(async (
    categoryPath?: string
  ): Promise<boolean> => {
    if (!selectAll && selectedRowKeys.length === 0) {
      message.warning('请选择要删除的商品');
      return false;
    }

    setBatchLoading(true);
    try {
      await batchDeleteStrategicProducts({
        selectAll,
        ids: selectAll ? undefined : selectedRowKeys,
        status: statusFilter,
        categoryPath,
        keyword,
      });
      message.success('批量删除成功');
      setSelectedRowKeys([]);
      setSelectAll(false);
      return true;
    } catch (error) {
      message.error('批量删除失败');
      return false;
    } finally {
      setBatchLoading(false);
    }
  }, [selectAll, selectedRowKeys, statusFilter, keyword]);

  // 初始加载统计
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return {
    // 状态
    loading,
    dataSource,
    total,
    page,
    pageSize,
    keyword,
    statusFilter,
    stats,
    selectedRowKeys,
    batchLoading,
    selectAll,
    // 设置函数
    setPage,
    setPageSize,
    setKeyword,
    setStatusFilter,
    setSelectedRowKeys,
    setSelectAll,
    // 操作函数
    loadStats,
    loadStrategicProducts,
    handleDelete,
    handleConfirm,
    handleBatchConfirm,
    handleBatchDelete,
  };
}
