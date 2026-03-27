/**
 * 商品退货规则数据管理 Hook
 */
import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import {
  getGoodsReturnRules,
  getGoodsReturnRuleStats,
  updateGoodsReturnRule,
  batchSetGoodsReturnRules,
} from '@/services/api/goods-return-rules';
import type {
  GoodsReturnRule,
  GoodsReturnRuleStats,
} from '@/types/goods-return-rules';
import type { PaginatedResult } from '@/types/warning';

export function useGoodsRules() {
  // 列表相关状态
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<GoodsReturnRule[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [canReturnFilter, setCanReturnFilter] = useState<boolean | undefined>();

  // 统计数据
  const [stats, setStats] = useState<GoodsReturnRuleStats>({
    canReturn: 0,
    cannotReturn: 0,
    total: 0,
  });

  // 批量操作相关
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  // 加载统计信息
  const fetchStats = useCallback(async () => {
    try {
      const result = await getGoodsReturnRuleStats();
      setStats(result);
    } catch (error) {
      console.error('加载统计信息失败:', error);
    }
  }, []);

  // 加载规则列表
  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const result: PaginatedResult<GoodsReturnRule> = await getGoodsReturnRules({
        page,
        pageSize,
        keyword: keyword || undefined,
        canReturnToSupplier: canReturnFilter,
      });
      setDataSource(result.data);
      setTotal(result.total);
    } catch (error) {
      message.error('加载规则列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, canReturnFilter]);

  // 搜索
  const handleSearch = useCallback(() => {
    setPage(1);
    fetchRules();
  }, [fetchRules]);

  // 批量设置退货规则
  const handleBatchSet = useCallback(async (canReturn: boolean, comment?: string) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要操作的商品');
      return false;
    }

    setBatchLoading(true);
    try {
      const goodsIds = dataSource
        .filter(item => selectedRowKeys.includes(item.id))
        .map(item => item.goodsId);

      const result = await batchSetGoodsReturnRules({
        goodsIds,
        canReturnToSupplier: canReturn,
        comment,
      });

      message.success(`成功设置 ${result.successCount} 条规则`);
      if (result.failedCount > 0) {
        message.warning(`${result.failedCount} 条规则设置失败`);
      }

      setSelectedRowKeys([]);
      fetchRules();
      fetchStats();
      return true;
    } catch (error) {
      message.error('批量操作失败');
      return false;
    } finally {
      setBatchLoading(false);
    }
  }, [selectedRowKeys, dataSource, fetchRules, fetchStats]);

  // 更新单条规则
  const handleUpdate = useCallback(async (
    id: number,
    canReturn: boolean,
    comment?: string
  ) => {
    try {
      await updateGoodsReturnRule(id, {
        canReturnToSupplier: canReturn,
        comment,
      });
      message.success('更新成功');
      fetchRules();
      fetchStats();
      return true;
    } catch (error) {
      message.error('更新失败');
      return false;
    }
  }, [fetchRules, fetchStats]);

  // 分页变化
  const handlePageChange = useCallback((p: number, ps: number) => {
    setPage(p);
    setPageSize(ps);
  }, []);

  // 初始加载
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // 分页或筛选变化时加载
  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  return {
    // 列表状态
    loading,
    dataSource,
    total,
    page,
    pageSize,
    // 统计状态
    stats,
    // 筛选状态
    keyword,
    canReturnFilter,
    // 批量状态
    selectedRowKeys,
    batchLoading,
    // 设置函数
    setKeyword,
    setCanReturnFilter,
    setSelectedRowKeys,
    // 操作方法
    fetchRules,
    fetchStats,
    handleSearch,
    handleBatchSet,
    handleUpdate,
    handlePageChange,
  };
}
