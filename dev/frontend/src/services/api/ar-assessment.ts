/**
 * 催收考核管理 API 服务
 */
import request from './request';
import type { PaginatedResult } from '@/types/warning';
import type {
  AssessmentRecord,
  AssessmentQueryParams,
  AssessmentStats,
} from '@/types/ar-assessment';

/** 获取考核记录列表 */
export const getArAssessments = (
  params?: AssessmentQueryParams
): Promise<PaginatedResult<AssessmentRecord>> => {
  return request.get<PaginatedResult<AssessmentRecord>>('/ar-assessment', { params });
};

/** 获取我的考核记录 */
export const getMyArAssessments = (
  params?: AssessmentQueryParams
): Promise<PaginatedResult<AssessmentRecord>> => {
  return request.get<PaginatedResult<AssessmentRecord>>('/ar-assessment/my', { params });
};

/** 获取考核统计 */
export const getArAssessmentStats = (): Promise<AssessmentStats> => {
  return request.get<AssessmentStats>('/ar-assessment/stats');
};

/** 获取考核详情 */
export const getArAssessmentById = (id: number): Promise<AssessmentRecord> => {
  return request.get<AssessmentRecord>(`/ar-assessment/${id}`);
};

/** 标记考核处理状态 */
export const handleArAssessment = (
  id: number,
  data: { status: 'handled' | 'skipped'; remark?: string }
): Promise<AssessmentRecord> => {
  return request.post<AssessmentRecord>(`/ar-assessment/${id}/handle`, data);
};

/** 手动触发考核计算 */
export const triggerArAssessmentCalculation = (): Promise<{
  totalProcessed: number;
  totalCreated: number;
}> => {
  return request.post('/ar-assessment/calculate');
};
