/**
 * 考核中心筛选状态管理 Hook
 * 将 category, page, keyword, ruleType, role, status, dateRange 同步到 URL
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'umi';

/** 默认分页大小 */
const DEFAULT_PAGE_SIZE = 20;

export function useAssessmentFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  // 从 URL 读取筛选条件
  const category = (searchParams.get('category') || 'ar_collection') as AssessmentCategory;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
  const keyword = searchParams.get('keyword') || '';
  const ruleType = searchParams.get('ruleType') || '';
  const role = searchParams.get('role') || '';
  const status = searchParams.get('status') || '';
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';

  /** 设置分类（切换 Tab 时重置分页和筛选） */
  const setCategory = useCallback((cat: AssessmentCategory) => {
    setSearchParams({ category: cat });
  }, [setSearchParams]);

  /** 设置分页 */
  const setPage = useCallback((p: number, ps?: number) => {
    const params: Record<string, string> = {};
    searchParams.forEach((v, k) => { params[k] = v; });
    params.page = String(p);
    if (ps) params.pageSize = String(ps);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  /** 设置筛选条件（重置分页到第1页） */
  const setFilters = useCallback((filters: {
    keyword?: string;
    ruleType?: string;
    role?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const params: Record<string, string> = { category };
    if (filters.keyword) params.keyword = filters.keyword;
    if (filters.ruleType) params.ruleType = filters.ruleType;
    if (filters.role) params.role = filters.role;
    if (filters.status) params.status = filters.status;
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;
    params.page = '1';
    params.pageSize = String(pageSize);
    setSearchParams(params);
  }, [category, pageSize, setSearchParams]);

  /** 重置所有筛选条件 */
  const resetFilters = useCallback(() => {
    setSearchParams({ category });
  }, [category, setSearchParams]);

  /** 构建 API 查询参数 */
  const queryParams = useMemo((): AssessmentQueryParams => ({
    category,
    page,
    pageSize,
    keyword: keyword || undefined,
    ruleType: ruleType || undefined,
    role: (role || undefined) as AssessmentRole | undefined,
    status: (status || undefined) as AssessmentStatus | undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  }), [category, page, pageSize, keyword, ruleType, role, status, startDate, endDate]);

  return {
    category,
    page,
    pageSize,
    keyword,
    ruleType,
    role,
    status,
    startDate,
    endDate,
    queryParams,
    setCategory,
    setPage,
    setFilters,
    resetFilters,
  };
}
