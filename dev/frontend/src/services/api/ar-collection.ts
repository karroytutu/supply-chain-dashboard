/**
 * 逾期催收管理 API 服务
 */
import request, { requestFormData } from './request';
import type { PaginatedResult } from '@/types/warning';
import type {
  CollectionTask,
  CollectionDetail,
  CollectionStats,
  CollectionAction,
  LegalProgress,
  MyTasksSummary,
  CollectionTaskQueryParams,
  VerifyParams,
  ExtensionParams,
  DifferenceParams,
  EscalateParams,
  ConfirmVerifyParams,
  ResolveDifferenceParams,
  SendNoticeParams,
  FileLawsuitParams,
  UpdateLegalProgressParams,
  UploadEvidenceResponse,
  Handler,
  UpcomingWarningData,
  WarningReminder,
} from '@/types/ar-collection';

/**
 * 获取催收统计概览
 */
export const getCollectionStats = (): Promise<CollectionStats> => {
  return request.get<CollectionStats>('/ar-collection/stats');
};

/**
 * 获取催收任务列表(分页)
 * 将前端 camelCase 参数映射为后端 snake_case 格式
 */
export const getCollectionTasks = (
  params?: CollectionTaskQueryParams
): Promise<PaginatedResult<CollectionTask>> => {
  const queryParams: Record<string, any> = {};
  if (params) {
    if (params.page !== undefined) queryParams.page = params.page;
    if (params.pageSize !== undefined) queryParams.page_size = params.pageSize;
    if (params.keyword) queryParams.keyword = params.keyword;
    if (params.status) queryParams.status = params.status;
    if (params.priority) queryParams.priority = params.priority;
    if (params.handlerId) queryParams.handlerId = params.handlerId;
    if (params.startDate) queryParams.startDate = params.startDate;
    if (params.endDate) queryParams.endDate = params.endDate;
    if (params.tab) queryParams.tab = params.tab;
    if (params.escalationLevel !== undefined) queryParams.escalationLevel = params.escalationLevel;
  }
  return request.get<PaginatedResult<CollectionTask>>('/ar-collection/tasks', { params: queryParams });
};

/**
 * 获取催收任务详情
 */
export const getCollectionTaskById = (id: number): Promise<CollectionTask> => {
  return request.get<CollectionTask>(`/ar-collection/tasks/${id}`);
};

/**
 * 获取任务明细列表
 */
export const getCollectionTaskDetails = (id: number): Promise<CollectionDetail[]> => {
  return request.get<CollectionDetail[]>(`/ar-collection/tasks/${id}/details`);
};

/**
 * 获取操作历史
 */
export const getCollectionTaskActions = (id: number): Promise<CollectionAction[]> => {
  return request.get<CollectionAction[]>(`/ar-collection/tasks/${id}/actions`);
};

/**
 * 获取法律催收进展
 */
export const getLegalProgress = (id: number): Promise<LegalProgress[]> => {
  return request.get<LegalProgress[]>(`/ar-collection/tasks/${id}/legal-progress`);
};

/**
 * 获取我的待办任务
 */
export const getMyTasks = (): Promise<MyTasksSummary> => {
  return request.get<MyTasksSummary>('/ar-collection/my-tasks');
};

/**
 * 获取处理人列表
 */
export const getHandlers = (): Promise<Handler[]> => {
  return request.get<Handler[]>('/ar-collection/handlers');
};

/**
 * 核销回款申请
 */
export const verifyTask = (id: number, data: VerifyParams): Promise<CollectionTask> => {
  return request.post<CollectionTask>(`/ar-collection/tasks/${id}/verify`, data);
};

/**
 * 申请延期
 */
export const applyExtension = (id: number, data: ExtensionParams): Promise<CollectionTask> => {
  return request.post<CollectionTask>(`/ar-collection/tasks/${id}/extension`, data);
};

/**
 * 标记差异
 */
export const markDifference = (id: number, data: DifferenceParams): Promise<CollectionTask> => {
  return request.post<CollectionTask>(`/ar-collection/tasks/${id}/difference`, data);
};

/**
 * 升级处理
 */
export const escalateTask = (id: number, data: EscalateParams): Promise<CollectionTask> => {
  return request.post<CollectionTask>(`/ar-collection/tasks/${id}/escalate`, data);
};

/**
 * 出纳确认核销
 */
export const confirmVerify = (id: number, data: ConfirmVerifyParams): Promise<CollectionTask> => {
  return request.post<CollectionTask>(`/ar-collection/tasks/${id}/confirm-verify`, data);
};

/**
 * 处理差异
 */
export const resolveDifference = (
  id: number,
  data: ResolveDifferenceParams
): Promise<CollectionTask> => {
  return request.post<CollectionTask>(`/ar-collection/tasks/${id}/resolve-difference`, data);
};

/**
 * 发送催收函
 */
export const sendNotice = (id: number, data: SendNoticeParams): Promise<CollectionTask> => {
  return request.post<CollectionTask>(`/ar-collection/tasks/${id}/send-notice`, data);
};

/**
 * 提起诉讼
 */
export const fileLawsuit = (id: number, data: FileLawsuitParams): Promise<CollectionTask> => {
  return request.post<CollectionTask>(`/ar-collection/tasks/${id}/file-lawsuit`, data);
};

/**
 * 更新法律催收进展
 */
export const updateLegalProgress = (
  id: number,
  data: UpdateLegalProgressParams
): Promise<CollectionTask> => {
  return request.post<CollectionTask>(`/ar-collection/tasks/${id}/update-legal-progress`, data);
};

/**
 * 上传催收凭证
 */
export const uploadEvidence = async (file: File): Promise<UploadEvidenceResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  return requestFormData<UploadEvidenceResponse>('/ar-collection/upload', formData);
};

/**
 * 获取逾期前预警数据(即将逾期的欠款列表)
 */
export const getUpcomingWarnings = (params?: {
  warningLevel?: 'today' | 'high' | 'medium';
  managerUserId?: number;
}): Promise<UpcomingWarningData> => {
  return request.get<UpcomingWarningData>('/ar-collection/warnings/upcoming', { params });
};

/**
 * 获取预警提醒历史记录
 */
export const getWarningReminders = (params?: {
  consumerName?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ list: WarningReminder[]; pagination: { page: number; pageSize: number; total: number } }> => {
  return request.get('/ar-collection/warnings/reminders', { params });
};


