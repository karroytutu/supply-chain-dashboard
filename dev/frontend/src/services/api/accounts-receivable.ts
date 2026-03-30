/**
 * 应收账款 API 服务
 */
import request from './request';
import type {
  ArReceivable,
  ArCollectionTask,
  ArPenaltyRecord,
  ArUserSignature,
  ArStats,
  AgingAnalysis,
  ArDetail,
  ArQueryParams,
  CollectionTaskParams,
  ReviewTaskParams,
  PenaltyQueryParams,
  CollectionSubmitParams,
  ReviewActionParams,
  SignatureSaveParams,
  ArPaginatedResult,
  UploadEvidenceResponse,
  SaveSignatureResponse,
  ArNotificationRecord,
} from '@/types/accounts-receivable';

// ==================== 数据查询 ====================

/**
 * 手动触发ERP数据同步
 */
export const syncArData = (): Promise<{ code: number; message: string; data: any }> => {
  return request.post<{ code: number; message: string; data: any }>('/ar/sync');
};

/**
 * 获取应收账款列表
 */
export const getArList = (params?: ArQueryParams): Promise<ArPaginatedResult<ArReceivable>> => {
  return request<ArPaginatedResult<ArReceivable>>('/ar', { params });
};

/**
 * 获取统计概览数据
 */
export const getArStats = (): Promise<ArStats> => {
  return request<ArStats>('/ar/stats');
};

/**
 * 获取账龄分析数据
 */
export const getAgingAnalysis = (): Promise<AgingAnalysis[]> => {
  return request<AgingAnalysis[]>('/ar/aging-analysis');
};

/**
 * 获取应收详情+催收历史
 */
export const getArDetail = (id: number): Promise<ArDetail> => {
  return request<ArDetail>(`/ar/${id}`);
};

// ==================== 催收任务 ====================

/**
 * 获取我的催收任务
 */
export const getMyTasks = (params?: CollectionTaskParams): Promise<ArPaginatedResult<ArCollectionTask>> => {
  return request<ArPaginatedResult<ArCollectionTask>>('/ar/my-tasks', { params });
};

/**
 * 获取待审核任务列表
 */
export const getReviewTasks = (params?: ReviewTaskParams): Promise<ArPaginatedResult<ArCollectionTask>> => {
  return request<ArPaginatedResult<ArCollectionTask>>('/ar/reviews', { params });
};

/**
 * 获取已处理记录
 */
export const getHistoryRecords = (params?: { page?: number; pageSize?: number }): Promise<ArPaginatedResult<ArCollectionTask>> => {
  return request<ArPaginatedResult<ArCollectionTask>>('/ar/history', { params });
};

// ==================== 催收操作 ====================

/**
 * 提交催收结果
 */
export const submitCollectionResult = (arId: number, data: CollectionSubmitParams): Promise<void> => {
  return request.post<void>(`/ar/${arId}/collect`, data);
};

/**
 * 审核（通过/拒绝）
 */
export const reviewTask = (arId: number, data: ReviewActionParams): Promise<void> => {
  return request.post<void>(`/ar/${arId}/review`, data);
};

// ==================== 文件上传 ====================

/**
 * 上传凭证图片
 * 使用原生 fetch 处理 FormData
 */
export const uploadEvidence = async (file: File): Promise<UploadEvidenceResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const token = localStorage.getItem('auth_token');
  const response = await fetch('/api/ar/upload-evidence', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`上传失败: ${response.status}`);
  }

  return response.json();
};

// ==================== 签名管理 ====================

/**
 * 获取历史签名
 */
export const getSignatures = (): Promise<ArUserSignature[]> => {
  return request<ArUserSignature[]>('/ar/signatures');
};

/**
 * 保存新签名
 */
export const saveSignature = (data: SignatureSaveParams): Promise<SaveSignatureResponse> => {
  return request.post<SaveSignatureResponse>('/ar/signatures', data);
};

// ==================== 考核管理 ====================

/**
 * 获取考核记录列表
 */
export const getPenalties = (params?: PenaltyQueryParams): Promise<ArPaginatedResult<ArPenaltyRecord>> => {
  return request<ArPaginatedResult<ArPenaltyRecord>>('/ar/penalties', { params });
};

/**
 * 获取我的考核记录
 */
export const getMyPenalties = (params?: { page?: number; pageSize?: number }): Promise<ArPaginatedResult<ArPenaltyRecord>> => {
  return request<ArPaginatedResult<ArPenaltyRecord>>('/ar/penalties/my', { params });
};

// ==================== 推送记录查询 ====================

/**
 * 获取应收账款的推送历史记录
 */
export const getArNotifications = (arId: number): Promise<{ code: number; data: ArNotificationRecord[] }> => {
  return request<{ code: number; data: ArNotificationRecord[] }>(`/ar/${arId}/notifications`);
};

// ==================== 默认导出 ====================

export default {
  syncArData,
  getArList,
  getArStats,
  getAgingAnalysis,
  getArDetail,
  getMyTasks,
  getReviewTasks,
  getHistoryRecords,
  submitCollectionResult,
  reviewTask,
  uploadEvidence,
  getSignatures,
  saveSignature,
  getPenalties,
  getMyPenalties,
  getArNotifications,
};
