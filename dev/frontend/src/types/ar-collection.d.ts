import type { PaginationParams, PaginatedResult } from './warning';

/**
 * 催收任务状态
 */
export type CollectionTaskStatus =
  | 'collecting'
  | 'difference_processing'
  | 'extension'
  | 'escalated'
  | 'pending_verify'
  | 'verified'
  | 'closed';

/**
 * 催收优先级
 */
export type CollectionPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * 升级层级: 0=营销师, 1=营销主管, 2=财务
 */
export type EscalationLevel = 0 | 1 | 2;

/**
 * 催收明细状态
 */
export type CollectionDetailStatus =
  | 'pending'
  | 'pending_verify'
  | 'partial_verified'
  | 'full_verified'
  | 'extension'
  | 'difference_pending'
  | 'difference_resolved'
  | 'escalated';

/**
 * 法律催收操作类型
 */
export type LegalActionType = 'send_notice' | 'file_lawsuit' | 'update_progress';

/**
 * 催收任务(客户维度)
 */
export interface CollectionTask {
  id: number;
  taskNo: string;
  consumerCode: string;
  consumerName: string;
  managerUserId: number;
  managerUserName: string;
  totalAmount: number;
  billCount: number;
  status: CollectionTaskStatus;
  currentHandlerId: number;
  currentHandlerRole: string;
  currentHandlerName?: string;
  firstOverdueDate: string;
  maxOverdueDays: number;
  escalationLevel: EscalationLevel;
  escalationCount: number;
  extensionCount: number;
  extensionUntil: string | null;
  canExtend: boolean;
  collectionCount: number;
  lastCollectionAt: string;
  priority: CollectionPriority;
  batchType: string;
  batchDate: string;
  pendingRole?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 催收明细(单据维度)
 */
export interface CollectionDetail {
  id: number;
  taskId: number;
  debtId: number;
  erpBillId: string;
  billTypeName: string;
  totalAmount: number;
  leftAmount: number;
  billOrderTime: string;
  expireTime: string;
  overdueDays: number;
  status: CollectionDetailStatus;
  processType: string | null;
  processAmount: number | null;
  processAt: string | null;
  processedBy: number | null;
  processedByName: string | null;
  remark: string | null;
  createdAt: string;
}

/**
 * 催收统计概览
 */
export interface CollectionStats {
  collecting: { count: number; amount: number };
  waiting: { count: number; amount: number };
  attention: { count: number; amount: number };
  collected: { count: number; amount: number };
  statusDistribution: Array<{
    status: string;
    count: number;
    amount: number;
    percentage: number;
  }>;
}

/**
 * 我的待办汇总
 */
export interface MyTasksSummary {
  totalTasks: number;
  totalAmount: number;
  urgentCount: number;
  todayDue: number;
  tasks: CollectionTask[];
}

/**
 * 操作历史记录
 */
export interface CollectionAction {
  id: number;
  taskId: number;
  detailIds: number[] | null;
  actionType: string;
  actionResult: string | null;
  remark: string | null;
  operatorId: number;
  operatorName: string;
  operatorRole: string;
  createdAt: string;
}

/**
 * 法律催收进展
 */
export interface LegalProgress {
  id: number;
  taskId: number;
  action: LegalActionType;
  description: string | null;
  attachmentUrl: string | null;
  operatorId: number;
  operatorName?: string;
  createdAt: string;
}

/**
 * 催收任务查询参数
 */
export interface CollectionTaskQueryParams extends PaginationParams {
  status?: CollectionTaskStatus;
  priority?: CollectionPriority;
  escalationLevel?: EscalationLevel;
  consumerName?: string;
  managerUserName?: string;
  handlerId?: number;
  keyword?: string;
  startDate?: string;
  endDate?: string;
  tab?: 'all' | 'mine' | 'responsible';
}

/**
 * 核销回款申请参数
 */
export interface VerifyParams {
  detailIds: number[];
  remark?: string;
}

/**
 * 申请延期参数
 */
export interface ExtensionParams {
  extensionDays: number;
  detailIds: number[];
  evidenceFileId?: number;
  signatureData?: string;
  reason: string;
}

/**
 * 标记差异参数
 */
export interface DifferenceParams {
  detailIds: number[];
  description: string;
}

/**
 * 升级处理参数
 */
export interface EscalateParams {
  targetLevel: EscalationLevel;
  reason: string;
}

/**
 * 出纳确认核销参数
 */
export interface ConfirmVerifyParams {
  result: 'approved' | 'rejected';
  remark?: string;
}

/**
 * 处理差异参数
 */
export interface ResolveDifferenceParams {
  resolution: string;
  remark?: string;
}

/**
 * 发送催收函参数
 */
export interface SendNoticeParams {
  attachmentFileId: number;
  description?: string;
}

/**
 * 提起诉讼参数
 */
export interface FileLawsuitParams {
  description: string;
  attachmentFileId?: number;
}

/**
 * 更新法律催收进展参数
 */
export interface UpdateLegalProgressParams {
  description: string;
  attachmentFileId?: number;
}

/**
 * 上传凭证响应
 */
export interface UploadEvidenceResponse {
  success: boolean;
  fileId: number;
  url: string;
  fileName: string;
}

/**
 * 处理人信息
 */
export interface Handler {
  id: number;
  name: string;
}

/**
 * 逾期前预警等级（简化为2级：high=1-2天, medium=3-5天）
 */
export type WarningLevel = 'high' | 'medium';

/**
 * 逾期前预警数据(即将逾期的欠款)
 */
export interface UpcomingWarning {
  erpBillId: string;
  billNo: string;
  consumerName: string;
  managerUserName: string;
  managerUserId: number | null;
  leftAmount: number;
  expireDate: string;
  daysToExpire: number;
  warningLevel: WarningLevel;
  reminderCount: number;
  settleMethod: number;        // 结算方式: 1=现款7天, 2=挂账
  consumerExpireDay: number;   // 最大欠款天数
}

/**
 * 预警汇总数据（简化为2级）
 */
export interface WarningSummary {
  within2Days: { count: number; amount: number };  // 1-2天内到期
  within5Days: { count: number; amount: number };  // 3-5天内到期
  totalCount: number;
  totalAmount: number;
}

/**
 * 预警响应数据
 */
export interface UpcomingWarningData {
  summary: WarningSummary;
  details: UpcomingWarning[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

/**
 * 预警提醒类型（简化为2级）
 */
export type ReminderType = 'pre_5d' | 'pre_2d';

/**
 * 预警提醒记录
 */
export interface WarningReminder {
  id: number;
  erpBillId: string;
  consumerName: string;
  managerUserName: string;
  leftAmount: number;
  expireDate: string;
  daysToExpire: number;
  reminderType: ReminderType;
  reminderChannel: string;
  reminderStatus: string;
  receiverUserId: number;
  createdAt: string;
}
