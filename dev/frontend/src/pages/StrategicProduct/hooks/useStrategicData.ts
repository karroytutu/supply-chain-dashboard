/**
 * 战略商品 - 数据获取 Hook
 */
import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import {
  getStrategicProducts,
  getStrategicProductStats,
} from '@/services/api/strategic-product';
import type {
  StrategicProduct,
  StrategicProductStats,
  StrategicProductStatus,
} from '@/types/strategic-product';
import type { PaginatedResult } from '@/types/warning';
import type { StrategicFilters } from './useStrategicFilters';
import { createLogger } from '../../../utils/logger';
const log = createLogger('StrategicProducthooks');

export function useStrategicData(filters: StrategicFilters) {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<StrategicProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<StrategicProductStats>({
    total: 0,
    pending: 0,
    confirmed: 0,
    rejected: 0,
  });

  const loadStats = useCallback(async () => {
    try {
      const result = await getStrategicProductStats();
      setStats(result);
    } catch (error) {
      log.error('加载统计信息失败:', error);
    }
  }, []);

  const loadStrategicProducts = useCallback(async (
    categoryPath?: string,
    filterStatus?: StrategicProductStatus,
    searchKeyword?: string
  ) => {
    setLoading(true);
    try {
      const result: PaginatedResult<StrategicProduct> = await getStrategicProducts({
        page: filters.page,
        pageSize: filters.pageSize,
        keyword: searchKeyword ?? filters.keyword,
        status: filterStatus ?? filters.statusFilter,
        categoryPath,
      });
      setDataSource(result.data);
      setTotal(result.total);
    } catch (error) {
      message.error('加载战略商品列表失败');
    } finally {
      setLoading(false);
    }
  }, [filters.page, filters.pageSize, filters.keyword, filters.statusFilter]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return {
    loading,
    dataSource,
    total,
    stats,
    loadStats,
    loadStrategicProducts,
  };
}
