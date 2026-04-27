/**
 * 催收总览 - 数据获取 Hook
 * 负责 API 调用、数据获取、loading 状态
 */
import { useState, useEffect, useCallback } from 'react';
import {
  getCollectionStats,
  getCollectionTasks,
  getHandlers,
  getUpcomingWarnings,
} from '@/services/api/ar-collection';
import type {
  CollectionStats,
  CollectionTask,
  Handler,
  WarningSummary,
} from '@/types/ar-collection';
import type { CollectionFilters } from './useCollectionFilters';

export function useCollectionData(filters: CollectionFilters, dateRangeKey: string, buildQueryParams: () => any) {
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [warningSummary, setWarningSummary] = useState<WarningSummary | null>(null);
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [total, setTotal] = useState(0);

  /** 加载统计数据 */
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await getCollectionStats();
      setStats(data);
    } catch {
      // 静默处理
    } finally {
      setStatsLoading(false);
    }
  }, []);

  /** 加载任务列表 */
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = buildQueryParams();
      const result = await getCollectionTasks(params);
      setTasks(result.data);
      setTotal(result.total);
    } catch {
      // 静默处理
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams]);

  /** 加载处理人列表 */
  const fetchHandlers = useCallback(async () => {
    try {
      const data = await getHandlers();
      setHandlers(data);
    } catch {
      // 静默处理
    }
  }, []);

  /** 加载预警汇总数据 */
  const fetchWarningSummary = useCallback(async () => {
    try {
      const params: { managerUserId?: number } = {};
      if (filters.handlerId) {
        params.managerUserId = filters.handlerId;
      }
      const data = await getUpcomingWarnings(params);
      setWarningSummary(data.summary);
    } catch {
      // 静默处理
    }
  }, [filters.handlerId]);

  /** 刷新所有数据 */
  const refresh = useCallback(() => {
    fetchStats();
    fetchTasks();
    fetchWarningSummary();
  }, [fetchStats, fetchTasks, fetchWarningSummary]);

  /** 初始加载 */
  useEffect(() => {
    fetchStats();
    fetchHandlers();
    fetchWarningSummary();
  }, []);

  /** 参数变化时重新加载列表 */
  useEffect(() => {
    fetchTasks();
  }, [filters.page, filters.pageSize, filters.statusTab, filters.searchKeyword, filters.handlerId, dateRangeKey]);

  /** 处理人筛选变化时重新加载预警汇总 */
  useEffect(() => {
    fetchWarningSummary();
  }, [filters.handlerId, fetchWarningSummary]);

  return {
    stats,
    tasks,
    warningSummary,
    handlers,
    loading,
    statsLoading,
    total,
    refresh,
  };
}
