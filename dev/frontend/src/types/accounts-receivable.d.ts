/**
 * 应收账款模块类型定义
 */

// ==================== 枚举类型 ====================

/** 应收账款状态 */
export type ArStatus = 'synced' | 'pre_warning_5' | 'pre_warning_2' | 'overdue' | 'collecting' | 'escalated' | 'resolved' | 'written_off';

/** 催收层级 */
export type CollectorLevel = 'marketing' | 'supervisor' | 'finance';

/** 催收任务状态 */
export type CollectionTaskStatus = 'pending' | 'in_progress' | 'completed' | 'escalated' | 'timeout';

/** 催收结果类型 */
export type CollectionResultType = 'customer_delay' | 'guarantee_delay' | 'paid_off' | 'escalate';

/** 审核状态 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** 考核级别 */
export type PenaltyLevel = 'none' | 'base' | 'double' | 'full';

/** 推送状态 */
export type NotificationStatus = 'none' | 'pre_warn_5_sent' | 'pre_warn_2_sent' | 'overdue_sent' | 'escalate_sent';

// ==================== 实体类型 ====================

/** 应收账款记录 */
export interface ArReceivable {
  id: number;
  erp_bill_id: string;
  order_no: string | null; // 订单号
  consumer_name: string;
  consumer_code: string;
  salesman_name: string;
  dept_name: string;
  manager_users: string;
  settle_method: number;        // 1=现结, 2=挂账
  max_debt_days: number;
  total_amount: number;
  left_amount: number;
  paid_amount: number;
  write_off_amount: number;
  bill_order_time: string;
  expire_day: string;
  last_pay_day: string;
  due_date: string;
  ar_status: ArStatus;
  current_collector_id: number | null;
  collector_level: CollectorLevel | null;
  notification_status: NotificationStatus;
  last_notified_at: string | null;
  overdue_days?: number;        // 计算字段：逾期天数
  aging_days?: number;          // 计算字段：账龄天数
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

/** 催收任务 */
export interface ArCollectionTask {
  id: number;
  ar_id: number;
  task_no: string;
  collector_id: number;
  collector_role: CollectorLevel;
  collector_name?: string;      // JOIN users
  assigned_at: string;
  deadline_at: string;
  status: CollectionTaskStatus;
  result_type: CollectionResultType | null;
  latest_pay_date: string | null;
  evidence_type: string | null;
  evidence_url: string | null;
  signature_data: string | null;
  escalate_reason: string | null;
  remark: string | null;
  reviewed_by: number | null;
  reviewer_name?: string;       // JOIN users
  review_status: ReviewStatus | null;
  review_comment: string | null;
  completed_at: string | null;
  created_at: string;
  // 关联的应收信息（JOIN 时获取）
  consumer_name?: string;
  left_amount?: number;
  overdue_days?: number;
  remaining_hours?: number;     // 剩余时间（小时）
  timeout_days?: number;        // 超时天数
  penalty_amount?: number;      // 当前考核金额
  order_no?: string | null;     // 订单号
  bill_order_time?: string;     // 单据日期
  settle_method?: number;       // 结算方式：1=现结, 2=挂账
  max_debt_days?: number;       // 最大欠款天数
  aging_days?: number;          // 账龄天数
  owed_amount?: number;         // 欠款金额（别名）
}

/** 考核记录 */
export interface ArPenaltyRecord {
  id: number;
  ar_id: number;
  task_id: number | null;
  user_id: number;
  user_name?: string;           // JOIN users
  user_role?: string;           // 角色
  penalty_level: PenaltyLevel;
  overdue_days: number;
  penalty_amount: number;
  penalty_rule: any;
  status: string;
  consumer_name?: string;       // JOIN ar_receivables
  left_amount?: number;
  created_at: string;
}

/** 操作日志 */
export interface ArActionLog {
  id?: string | number;
  source?: 'action' | 'notification';  // 来源类型: action=操作日志, notification=通知记录
  ar_id: number;
  task_id: number | null;
  action_type: string;
  operator_id: number | null;
  operator_name: string;
  details: any;
  created_at: string;
}

/** 用户签名 */
export interface ArUserSignature {
  id: number;
  signature_data: string;
  is_default: boolean;
  created_at: string;
}

// ==================== 统计与分析类型 ====================

/** 应收统计概览 */
export interface ArStats {
  totalAmount: number;
  overdueAmount: number;
  overdueRate: number;
  avgAgingDays: number;
  totalCount: number;
  overdueCount: number;
  totalAmountTrend: number;     // 环比百分比变化
  overdueAmountTrend: number;
  overdueRateTrend: number;
  avgAgingDaysTrend: number;
  hasComparison?: boolean;       // 是否有对比数据
  comparisonDate?: string | null; // 对比日期，如 "2026-02-28"
}

/** 账龄分析 */
export interface AgingAnalysis {
  range: string;                // 如 "30天内", "30-60天"
  amount: number;
  count: number;
}

/** 催收进度统计 */
export interface CollectionProgress {
  label: string;
  value: number;
  color: string;
}

// ==================== 请求参数类型 ====================

/** 应收列表查询参数 */
export interface ArQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: ArStatus;
  overdueDaysMin?: number;
  overdueDaysMax?: number;
  amountMin?: number;
  amountMax?: number;
  sortField?: string;
  sortOrder?: 'ascend' | 'descend';
}

/** 催收任务查询参数 */
export interface CollectionTaskParams {
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 审核任务查询参数 */
export interface ReviewTaskParams {
  reviewType?: string;          // finance_review / cashier_verify
  page?: number;
  pageSize?: number;
}

/** 考核查询参数 */
export interface PenaltyQueryParams {
  userId?: number;
  penaltyLevel?: PenaltyLevel;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/** 催收结果提交参数 */
export interface CollectionSubmitParams {
  resultType: CollectionResultType;
  latestPayDate?: string;
  evidenceUrl?: string;
  signatureData?: string;
  escalateReason?: string;
  remark?: string;
}

/** 审核操作参数 */
export interface ReviewActionParams {
  taskId: number;
  action: 'approve' | 'reject';
  comment?: string;
}

/** 签名保存参数 */
export interface SignatureSaveParams {
  signatureData: string;
  isDefault?: boolean;
}

// ==================== 响应类型 ====================

/** 分页结果 */
export interface ArPaginatedResult<T> {
  list: T[];
  total: number;
}

/** 应收详情（含催收历史） */
export interface ArDetail {
  receivable: ArReceivable;
  tasks: ArCollectionTask[];
  actionLogs: ArActionLog[];
}

/** 文件上传响应 */
export interface UploadEvidenceResponse {
  url: string;
}

/** 签名保存响应 */
export interface SaveSignatureResponse {
  id: number;
}
