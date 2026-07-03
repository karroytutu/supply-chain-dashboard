/**
 * 考核中心筛选状态管理 Hook
 * 将 category, page, keyword, ruleType, assessmentUserId, status, dateRange 同步到 URL
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'umi';

/** 默认分页大小 */
const DEFAULT_PAGE_SIZE = 20;

export function useAssessmentFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  // 从 URL 读取筛选条件
  const category = searchParams.get('category') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
  const keyword = searchParams.get('keyword') || '';
  const ruleType = searchParams.get('ruleType') || '';
  const status = searchParams.get('status') || '';
  const assessmentUserId = searchParams.get('assessmentUserId') || '';
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';

  /** 设置分页 */
  const setPage = useCallback((p: number, ps?: number) => {
    const params: Record<string, string> = {};
    searchParams.forEach((v, k) => { params[k] = v; });
    params.page = String(p);
    if (ps) params.pageSize = String(ps);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  /** 设置筛选条件（重置分页到第1页）
   * 规则：undefined = 未变更保留旧值，'' = 显式清空，非空字符串 = 设置新值
   */
  const setFilters = useCallback((filters: {
    category?: string;
    keyword?: string;
    ruleType?: string;
    status?: string;
    assessmentUserId?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const params: Record<string, string> = {};
    // 每个筛选项：undefined 表示未传入（保留旧值），其他值（含 ''）表示显式设置
    const resolvedCategory = filters.category !== undefined ? filters.category : category;
    if (resolvedCategory) params.category = resolvedCategory;
    const resolvedKeyword = filters.keyword !== undefined ? filters.keyword : keyword;
    if (resolvedKeyword) params.keyword = resolvedKeyword;
    const resolvedRuleType = filters.ruleType !== undefined ? filters.ruleType : ruleType;
    if (resolvedRuleType) params.ruleType = resolvedRuleType;
    const resolvedStatus = filters.status !== undefined ? filters.status : status;
    if (resolvedStatus) params.status = resolvedStatus;
    const resolvedAssessmentUserId = filters.assessmentUserId !== undefined ? filters.assessmentUserId : assessmentUserId;
    if (resolvedAssessmentUserId) params.assessmentUserId = resolvedAssessmentUserId;
    const resolvedStartDate = filters.startDate !== undefined ? filters.startDate : startDate;
    if (resolvedStartDate) params.startDate = resolvedStartDate;
    const resolvedEndDate = filters.endDate !== undefined ? filters.endDate : endDate;
    if (resolvedEndDate) params.endDate = resolvedEndDate;
    params.page = '1';
    params.pageSize = String(pageSize);
    setSearchParams(params);
  }, [category, keyword, ruleType, status, assessmentUserId, startDate, endDate, pageSize, setSearchParams]);

  /** 重置所有筛选条件 */
  const resetFilters = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  /** 构建 API 查询参数 */
  const queryParams = useMemo((): AssessmentQueryParams => ({
    category: (category || undefined) as AssessmentCategory | undefined,
    page,
    pageSize,
    keyword: keyword || undefined,
    ruleType: ruleType || undefined,
    status: (status || undefined) as AssessmentStatus | undefined,
    assessmentUserId: assessmentUserId ? parseInt(assessmentUserId, 10) : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  }), [category, page, pageSize, keyword, ruleType, status, assessmentUserId, startDate, endDate]);

  return {
    category,
    page,
    pageSize,
    keyword,
    ruleType,
    status,
    assessmentUserId,
    startDate,
    endDate,
    queryParams,
    setPage,
    setFilters,
    resetFilters,
  };
}
