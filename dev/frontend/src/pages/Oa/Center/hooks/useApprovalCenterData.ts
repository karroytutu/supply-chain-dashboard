/**
 * 流程中心 - 数据加载 Hook
 * 管理列表和统计数据的 API 调用（详情加载已移至 ApprovalDetailPanel 内部）
 */
import { useState, useEffect, useCallback } from 'react';
import { oaApi } from '@/services/api/oa';
import type { ApprovalInstance, ApprovalStats, ViewMode } from '@/types/oa';
import { createLogger } from '../../../../utils/logger';
const log = createLogger('OaCenter');

interface FiltersState {
  viewMode: ViewMode;
  page: number;
  searchText: string;
}

export function useApprovalCenterData(filters: FiltersState) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ApprovalStats>({
    total: 0, pending: 0, processed: 0, approved: 0, rejected: 0, my: 0, cc: 0,
  });
  const [list, setList] = useState<ApprovalInstance[]>([]);
  const [total, setTotal] = useState(0);

  const loadStats = useCallback(async () => {
    try {
      const res = await oaApi.getStats();
      setStats(res.data);
    } catch (error) {
      log.error('加载统计失败:', error);
    }
  }, []);

  const loadList = useCallback(async (): Promise<ApprovalInstance[]> => {
    setLoading(true);
    try {
      const result = await oaApi.getApprovalList({
        viewMode: filters.viewMode,
        page: filters.page,
        pageSize: 20,
        keyword: filters.searchText,
      });
      setList(result.data);
      setTotal(result.total);
      return result.data;
    } catch (error) {
      log.error('加载列表失败:', error);
      return [];
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [filters.viewMode, filters.page]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  useEffect(() => { loadStats(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  useEffect(() => { loadList(); }, [filters.viewMode, filters.page, filters.searchText]);

  return { loading, stats, list, total, loadList, loadStats };
}
