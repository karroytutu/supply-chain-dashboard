/**
 * 流程中心 - 数据加载 Hook
 * 管理 API 调用、数据状态、loading 状态
 */
import { useState, useEffect, useCallback } from 'react';
import { oaApi } from '@/services/api/oa';
import type { ApprovalInstance, ApprovalDetail, ApprovalStats, ViewMode } from '@/types/oa';
import { createLogger } from '../../../../utils/logger';
const log = createLogger('OaCenter');

interface FiltersState {
  viewMode: ViewMode;
  page: number;
  searchText: string;
  selectedId: number | null;
}

export function useApprovalCenterData(filters: FiltersState) {
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [stats, setStats] = useState<ApprovalStats>({
    total: 0, pending: 0, processed: 0, approved: 0, rejected: 0, my: 0, cc: 0,
  });
  const [list, setList] = useState<ApprovalInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const res = await oaApi.getStats();
      setStats(res.data);
    } catch (error) {
      log.error('加载统计失败:', error);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const result = await oaApi.getApprovalList({
        viewMode: filters.viewMode,
        page: filters.page,
        pageSize: 20,
      });
      setList(result.data);
      setTotal(result.total);
      if (result.data.length > 0 && !filters.selectedId) {
        // 不在 data hook 中设置 selectedId，由外部处理
      }
    } catch (error) {
      log.error('加载列表失败:', error);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [filters.viewMode, filters.page]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await oaApi.getDetail(id);
      setDetail(res.data);
    } catch (error) {
      log.error('加载详情失败:', error);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  useEffect(() => { loadStats(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  useEffect(() => { loadList(); }, [filters.viewMode, filters.page]);
  useEffect(() => {
    if (filters.selectedId) {
      loadDetail(filters.selectedId);
    } else {
      setDetail(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  }, [filters.selectedId]);

  return { loading, detailLoading, stats, list, total, detail, loadList, loadStats, loadDetail };
}
