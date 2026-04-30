/**
 * 统一考核管理 API 服务
 */
import request from './request';

/** 获取考核记录列表 */
export const getAssessmentRecords = (
  params?: AssessmentQueryParams,
): Promise<AssessmentListResponse> => {
  return request.get<AssessmentListResponse>('/assessment', { params });
};

/** 获取统计数据 */
export const getAssessmentStats = (
  category?: AssessmentCategory,
): Promise<AssessmentStats> => {
  return request.get<AssessmentStats>('/assessment/stats', {
    params: category ? { category } : {},
  });
};

/** 获取我的考核记录 */
export const getMyAssessments = (
  params?: AssessmentQueryParams,
): Promise<AssessmentListResponse> => {
  return request.get<AssessmentListResponse>('/assessment/my', { params });
};

/** 获取单条考核记录详情 */
export const getAssessmentById = (id: number): Promise<AssessmentRecord> => {
  return request.get<AssessmentRecord>(`/assessment/${id}`);
};

/** 获取分类配置 */
export const getAssessmentCategories = (): Promise<AssessmentCategoryConfig[]> => {
  return request.get<AssessmentCategoryConfig[]>('/assessment/categories');
};

/** 处理考核记录（确认/取消） */
export const handleAssessmentAction = (
  id: number,
  data: AssessmentActionRequest,
): Promise<AssessmentRecord> => {
  return request.post<AssessmentRecord>(`/assessment/${id}/action`, data);
};

/** 提交申诉 */
export const submitAssessmentAppeal = (
  id: number,
  data: AssessmentAppealRequest,
): Promise<AssessmentAppealResponse> => {
  return request.post<AssessmentAppealResponse>(`/assessment/${id}/appeal`, data);
};

/** 手动触发计算 */
export const calculateAssessment = (
  data?: AssessmentCalculateRequest,
): Promise<{ totalRecords: number; newRecords: number }> => {
  return request.post<{ totalRecords: number; newRecords: number }>(
    '/assessment/calculate',
    data || {},
  );
};
