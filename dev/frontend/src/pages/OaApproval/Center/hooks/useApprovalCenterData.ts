/**
 * 审批中心 - 数据加载 Hook
 * 管理 API 调用、数据状态、loading 状态
 */
import { useState, useEffect, useCallback } from 'react';
import { oaApprovalApi } from '@/services/api/oa-approval';
import type { ApprovalInstance, ApprovalDetail, ApprovalStats, ViewMode } from '@/types/oa-approval';

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
      const res = await oaApprovalApi.getStats();
      setStats(res.data);
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const result = await oaApprovalApi.getApprovalList({
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
      console.error('加载列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [filters.viewMode, filters.page]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await oaApprovalApi.getDetail(id);
      setDetail(res.data);
    } catch (error) {
      console.error('加载详情失败:', error);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { loadList(); }, [filters.viewMode, filters.page]);
  useEffect(() => {
    if (filters.selectedId) {
      loadDetail(filters.selectedId);
    } else {
      setDetail(null);
    }
  }, [filters.selectedId]);

  return { loading, detailLoading, stats, list, total, detail, loadList, loadStats, loadDetail };
}
