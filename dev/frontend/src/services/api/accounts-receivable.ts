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
  // 客户维度类型
  ArCustomerCollectionTask,
  CustomerTaskDetail,
  CustomerTaskQueryParams,
  CustomerCollectionSubmitParams,
  CustomerMixedSubmitParams,
  CustomerQuickDelayParams,
  CustomerEscalateParams,
  CustomerReviewQueryParams,
  CustomerReviewActionParams,
  // 逾期管理类型
  OverdueStatsResponse,
  OverdueTaskItem,
  TimeoutWarningItem,
  TimeEfficiencyResponse,
  CustomerOverdueItem,
  PerformanceStatsResponse,
  AvailableCollector,
  ArDeadlineConfig,
  OverdueTaskQueryParams,
  TimeEfficiencyQueryParams,
  PerformanceQueryParams,
  StartPreprocessingParams,
  CompletePreprocessingParams,
  AssignOverdueTaskParams,
  UpdateDeadlineConfigParams,
  PreprocessingTaskBillsResponse,
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
 * 获取所有催收任务（管理员视角）
 */
export const getAllTasks = (params?: CollectionTaskParams): Promise<ArPaginatedResult<ArCollectionTask>> => {
  return request<ArPaginatedResult<ArCollectionTask>>('/ar/all-tasks', { params });
};

/**
 * 获取逾期前预警数据（管理员视角）
 */
export const getPreWarningData = (): Promise<{
  preWarn5: ArReceivable[];
  preWarn2: ArReceivable[];
  preWarn5Count: number;
  preWarn2Count: number;
  preWarn5Total: number;
  preWarn2Total: number;
}> => {
  return request<{
    preWarn5: ArReceivable[];
    preWarn2: ArReceivable[];
    preWarn5Count: number;
    preWarn2Count: number;
    preWarn5Total: number;
    preWarn2Total: number;
  }>('/ar/pre-warning');
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

// ==================== 客户维度催收任务 ====================

/**
 * 获取客户催收任务列表
 */
export const getCustomerTasks = (params?: CustomerTaskQueryParams): Promise<{ code: number; data: ArPaginatedResult<ArCustomerCollectionTask> }> => {
  return request<{ code: number; data: ArPaginatedResult<ArCustomerCollectionTask> }>('/ar/customer-tasks', { params });
};

/**
 * 获取客户催收任务详情
 */
export const getCustomerTaskDetail = (taskId: number): Promise<{ code: number; data: CustomerTaskDetail }> => {
  return request<{ code: number; data: CustomerTaskDetail }>(`/ar/customer-tasks/${taskId}`);
};

/**
 * 提交客户催收结果（统一操作）
 */
export const submitCustomerCollectResult = (taskId: number, data: CustomerCollectionSubmitParams): Promise<{ success: boolean; message: string }> => {
  return request.post<{ success: boolean; message: string }>(`/ar/customer-tasks/${taskId}/collect`, data);
};

/**
 * 提交客户催收结果（混合操作）
 */
export const submitCustomerMixedResult = (taskId: number, data: CustomerMixedSubmitParams): Promise<{ success: boolean; message: string }> => {
  return request.post<{ success: boolean; message: string }>(`/ar/customer-tasks/${taskId}/collect-batch`, data);
};

/**
 * 客户任务快速延期
 */
export const quickDelayCustomerTask = (taskId: number, data: CustomerQuickDelayParams): Promise<{ success: boolean; message: string }> => {
  return request.post<{ success: boolean; message: string }>(`/ar/customer-tasks/${taskId}/quick-delay`, data);
};

/**
 * 客户任务升级
 */
export const escalateCustomerTask = (taskId: number, data: CustomerEscalateParams): Promise<{ success: boolean; message: string; newTaskId?: number }> => {
  return request.post<{ success: boolean; message: string; newTaskId?: number }>(`/ar/customer-tasks/${taskId}/escalate`, data);
};

// ==================== 客户维度审核 ====================

/**
 * 获取客户维度待审核任务
 */
export const getCustomerReviewTasks = (params?: CustomerReviewQueryParams): Promise<{ code: number; data: ArPaginatedResult<ArCustomerCollectionTask> }> => {
  return request<{ code: number; data: ArPaginatedResult<ArCustomerCollectionTask> }>('/ar/customer-review', { params });
};

/**
 * 客户任务审核
 */
export const reviewCustomerTask = (taskId: number, data: CustomerReviewActionParams): Promise<{ success: boolean; message: string }> => {
  return request.post<{ success: boolean; message: string }>(`/ar/customer-review/${taskId}/review`, data);
};

/**
 * 获取客户维度历史记录
 */
export const getCustomerHistoryRecords = (params?: { page?: number; pageSize?: number }): Promise<{ code: number; data: ArPaginatedResult<ArCustomerCollectionTask> }> => {
  return request<{ code: number; data: ArPaginatedResult<ArCustomerCollectionTask> }>('/ar/customer-history', { params });
};

// ==================== 默认导出 ====================

// ==================== 逾期管理 API ====================

/**
 * 获取逾期统计
 */
export const getOverdueStats = (): Promise<OverdueStatsResponse> => {
  return request<OverdueStatsResponse>('/ar/overdue/stats');
};

/**
 * 获取待预处理列表
 */
export const getPreprocessingList = (params?: OverdueTaskQueryParams): Promise<ArPaginatedResult<OverdueTaskItem>> => {
  return request<ArPaginatedResult<OverdueTaskItem>>('/ar/overdue/preprocessing', { params });
};

/**
 * 开始预处理
 */
export const startPreprocessing = (data: StartPreprocessingParams): Promise<{ success: boolean; message: string }> => {
  return request.post<{ success: boolean; message: string }>('/ar/overdue/preprocessing/start', data);
};

/**
 * 完成预处理
 */
export const completePreprocessing = (data: CompletePreprocessingParams): Promise<{ success: boolean; message: string }> => {
  return request.post<{ success: boolean; message: string }>('/ar/overdue/preprocessing/complete', data);
};

/**
 * 获取预处理任务关联的订单明细
 */
export const getPreprocessingTaskBills = (taskId: number): Promise<PreprocessingTaskBillsResponse> => {
  return request<PreprocessingTaskBillsResponse>(`/ar/overdue/preprocessing/${taskId}/bills`);
};

/**
 * 获取待分配列表
 */
export const getAssignmentList = (params?: OverdueTaskQueryParams): Promise<ArPaginatedResult<OverdueTaskItem>> => {
  return request<ArPaginatedResult<OverdueTaskItem>>('/ar/overdue/assignment', { params });
};

/**
 * 分配任务
 */
export const assignOverdueTask = (data: AssignOverdueTaskParams): Promise<{ success: boolean; message: string }> => {
  return request.post<{ success: boolean; message: string }>('/ar/overdue/assignment/assign', data);
};

/**
 * 获取可分配催收人员列表
 */
export const getAvailableCollectors = (): Promise<AvailableCollector[]> => {
  return request<AvailableCollector[]>('/ar/overdue/collectors');
};

/**
 * 获取时限配置
 */
export const getDeadlineConfigs = (): Promise<ArDeadlineConfig[]> => {
  return request<ArDeadlineConfig[]>('/ar/overdue/deadline-configs');
};

/**
 * 更新时限配置
 */
export const updateDeadlineConfig = (id: number, data: UpdateDeadlineConfigParams): Promise<{ success: boolean; message: string }> => {
  return request.put<{ success: boolean; message: string }>(`/ar/overdue/deadline-configs/${id}`, data);
};

/**
 * 获取超时预警列表
 */
export const getTimeoutWarnings = (params?: { page?: number; pageSize?: number }): Promise<ArPaginatedResult<TimeoutWarningItem>> => {
  return request<ArPaginatedResult<TimeoutWarningItem>>('/ar/overdue/timeout-warnings', { params });
};

/**
 * 获取时效分析
 */
export const getTimeEfficiency = (params?: TimeEfficiencyQueryParams): Promise<TimeEfficiencyResponse> => {
  return request<TimeEfficiencyResponse>('/ar/overdue/time-efficiency', { params });
};

/**
 * 获取客户逾期列表
 */
export const getCustomerOverdueList = (params?: OverdueTaskQueryParams): Promise<ArPaginatedResult<CustomerOverdueItem>> => {
  return request<ArPaginatedResult<CustomerOverdueItem>>('/ar/overdue/customers', { params });
};

/**
 * 获取绩效统计
 */
export const getPerformanceStats = (params?: PerformanceQueryParams): Promise<PerformanceStatsResponse> => {
  return request<PerformanceStatsResponse>('/ar/overdue/performance', { params });
};

export default {
  syncArData,
  getArList,
  getArStats,
  getAgingAnalysis,
  getArDetail,
  getMyTasks,
  getAllTasks,
  getPreWarningData,
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
  // 客户维度 API
  getCustomerTasks,
  getCustomerTaskDetail,
  submitCustomerCollectResult,
  submitCustomerMixedResult,
  quickDelayCustomerTask,
  escalateCustomerTask,
  getCustomerReviewTasks,
  reviewCustomerTask,
  getCustomerHistoryRecords,
  // 逾期管理 API
  getOverdueStats,
  getPreprocessingList,
  startPreprocessing,
  completePreprocessing,
  getPreprocessingTaskBills,
  getAssignmentList,
  assignOverdueTask,
  getAvailableCollectors,
  getDeadlineConfigs,
  updateDeadlineConfig,
  getTimeoutWarnings,
  getTimeEfficiency,
  getCustomerOverdueList,
  getPerformanceStats,
};
