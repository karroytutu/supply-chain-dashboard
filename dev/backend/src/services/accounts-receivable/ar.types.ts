/**
 * 应收账款管理类型定义
 */

/** 应收账款状态 */
export type ArStatus =
  | 'synced'
  | 'pre_warning_5'
  | 'pre_warning_2'
  | 'overdue'
  | 'collecting'
  | 'escalated'
  | 'resolved'
  | 'written_off';

/** 催收层级 */
export type CollectorLevel = 'marketing' | 'supervisor' | 'finance';

/** 催收任务状态 */
export type CollectionTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'escalated'
  | 'timeout';

/** 催收结果类型 */
export type CollectionResultType =
  | 'customer_delay'
  | 'guarantee_delay'
  | 'paid_off'
  | 'escalate';

/** 审核状态 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

/** 考核级别 */
export type PenaltyLevel = 'none' | 'base' | 'double' | 'full';

/** 通知类型 */
export type NotificationType =
  | 'pre_warn_5'
  | 'pre_warn_2'
  | 'overdue_collect'
  | 'timeout_penalty'
  | 'escalate'
  | 'auto_escalate'
  | 'pending_review'
  | 'review_result'
  | 'payment_confirmed'
  | 'guarantee_notify'
  | 'daily_summary';

/** 推送状态 */
export type NotificationStatus =
  | 'none'
  | 'pre_warn_5_sent'
  | 'pre_warn_2_sent'
  | 'overdue_sent'
  | 'escalate_sent';

/** 应收账款实体 */
export interface ArReceivable {
  id: number;
  erp_bill_id: string;
  consumer_name: string;
  consumer_code: string | null;
  salesman_name: string | null;
  dept_name: string | null;
  manager_users: string | null;
  settle_method: number | null;
  max_debt_days: number | null;
  total_amount: number;
  left_amount: number;
  paid_amount: number;
  write_off_amount: number;
  bill_order_time: Date | null;
  expire_day: Date | null;
  last_pay_day: Date | null;
  due_date: Date | null;
  ar_status: ArStatus;
  current_collector_id: number | null;
  collector_level: CollectorLevel | null;
  notification_status: NotificationStatus;
  last_notified_at: Date | null;
  last_synced_at: Date;
  created_at: Date;
  updated_at: Date;
}

/** 催收任务实体 */
export interface ArCollectionTask {
  id: number;
  ar_id: number;
  task_no: string;
  collector_id: number;
  collector_role: CollectorLevel;
  assigned_at: Date;
  deadline_at: Date;
  status: CollectionTaskStatus;
  result_type: CollectionResultType | null;
  latest_pay_date: Date | null;
  evidence_type: string | null;
  evidence_url: string | null;
  signature_data: string | null;
  escalate_reason: string | null;
  remark: string | null;
  reviewed_by: number | null;
  review_status: ReviewStatus | null;
  review_comment: string | null;
  completed_at: Date | null;
  created_at: Date;
}

/** 考核记录实体 */
export interface ArPenaltyRecord {
  id: number;
  ar_id: number;
  task_id: number | null;
  user_id: number;
  penalty_level: PenaltyLevel;
  overdue_days: number;
  penalty_amount: number;
  penalty_rule: Record<string, any> | null;
  status: string;
  created_at: Date;
}

/** 通知记录实体 */
export interface ArNotificationRecord {
  id: number;
  ar_ids: number[];
  notification_type: NotificationType;
  recipient_id: number;
  recipient_name: string | null;
  consumer_name: string | null;
  bill_count: number;
  message_content: string | null;
  status: string;
  sent_at: Date | null;
  dingtalk_task_id: string | null;
  error_message: string | null;
  created_at: Date;
}

/** ERP同步结果 */
export interface ArSyncResult {
  total: number;
  synced: number;
  updated: number;
  errors: number;
}

/** 查询参数 */
export interface ArQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: ArStatus;
  overdueDaysMin?: number;
  overdueDaysMax?: number;
  amountMin?: number;
  amountMax?: number;
}

/** 列表结果 */
export interface ArListResult {
  list: ArReceivable[];
  total: number;
}

/** 统计数据 */
export interface ArStats {
  totalAmount: number;
  overdueAmount: number;
  overdueRate: number;
  avgAgingDays: number;
  totalAmountTrend: number;
  overdueAmountTrend: number;
  overdueRateTrend: number;
  avgAgingDaysTrend: number;
  hasComparison?: boolean;
  comparisonDate?: string | null;
}

/** 账龄分析 */
export interface AgingAnalysis {
  range: string;
  amount: number;
  count: number;
}
