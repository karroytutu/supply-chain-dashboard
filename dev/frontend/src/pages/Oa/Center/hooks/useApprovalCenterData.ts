/**
 * 流程中心 - 数据加载 Hook
 * 管理列表和统计数据的 API 调用（详情加载已移至 ApprovalDetailPanel 内部）
 */
import { useState, useEffect, useCallback } from 'react';
import { oaApi } from '@/services/api/oa';
import type { ApprovalInstance, ApprovalStats, ApprovalStatus, FormTypeDefinition, ViewMode } from '@/types/oa';
import { createLogger } from '../../../../utils/logger';
const log = createLogger('OaCenter');

// 模块级缓存，避免页面来回切换重复请求
let cachedFormTypes: FormTypeDefinition[] | null = null;

interface FiltersState {
  viewMode: ViewMode;
  page: number;
  searchText: string;
  formTypeCode?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  applicantName?: string | null;
}

export function useApprovalCenterData(filters: FiltersState) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ApprovalStats>({
    total: 0, pending: 0, processed: 0, approved: 0, rejected: 0, my: 0, cc: 0,
  });
  const [list, setList] = useState<ApprovalInstance[]>([]);
  const [total, setTotal] = useState(0);
  const [formTypes, setFormTypes] = useState<FormTypeDefinition[]>(cachedFormTypes ?? []);

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
        formTypeCode: filters.formTypeCode ?? undefined,
        status: (filters.status ?? undefined) as ApprovalStatus | undefined,
        startDate: filters.startDate ?? undefined,
        endDate: filters.endDate ?? undefined,
        applicantName: filters.applicantName ?? undefined,
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
  }, [
    filters.viewMode, filters.page, filters.searchText,
    filters.formTypeCode, filters.status,
    filters.startDate, filters.endDate, filters.applicantName,
  ]);

  /** 加载表单类型（命中缓存则直接赋值） */
  const loadFormTypes = useCallback(async () => {
    if (cachedFormTypes) {
      setFormTypes(cachedFormTypes);
      return;
    }
    try {
      const res = await oaApi.getFormTypes();
      cachedFormTypes = res.data;
      setFormTypes(res.data);
    } catch (error) {
      log.error('加载表单类型失败:', error);
      // formTypes 保持空数组，不弹提示
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadFormTypes(); }, [loadFormTypes]);

  return { loading, stats, list, total, loadList, loadStats, formTypes };
}
