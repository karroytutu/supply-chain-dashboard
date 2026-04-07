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

/** 预警类型 */
export type PreWarnType = 'pre_warn_5' | 'pre_warn_2';

/** 通知类型 */
export type NotificationType =
  | 'pre_warn_aggregated'  // 聚合预警（替代 pre_warn_5 和 pre_warn_2）
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
  removed?: number; // 清理的孤儿数据数量
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

/** 按客户分组的预警数据 */
export interface PreWarnConsumerGroup {
  consumerName: string;
  settleMethod: string;
  bills: Array<{
    billNo: string;
    amount: number;
    dueDate: string;
    arId: number;
  }>;
  totalAmount: number;
}

/** 单个预警类型的数据 */
export interface PreWarnTypeData {
  type: PreWarnType;
  consumers: PreWarnConsumerGroup[];
  totalCount: number;
  totalAmount: number;
  arIds: number[];
}

/** 聚合预警数据（按营销师） */
export interface AggregatedPreWarnData {
  managerUsers: string;
  warn5Data: PreWarnTypeData | null;
  warn2Data: PreWarnTypeData | null;
  allArIds: number[];
}

// ==================== 客户维度催收任务 ====================

/** 客户催收结果类型（包含混合结果） */
export type CustomerCollectionResultType = CollectionResultType | 'mixed';

/** 客户催收任务实体 */
export interface ArCustomerCollectionTask {
  id: number;
  task_no: string;
  consumer_name: string;
  consumer_code: string | null;
  manager_users: string | null;
  ar_ids: number[];
  total_amount: number;
  bill_count: number;
  collector_id: number;
  collector_role: CollectorLevel;
  assigned_at: Date;
  deadline_at: Date;
  status: CollectionTaskStatus;
  result_type: CustomerCollectionResultType | null;
  latest_pay_date: Date | null;
  evidence_url: string | null;
  signature_data: string | null;
  escalate_reason: string | null;
  remark: string | null;
  reviewed_by: number | null;
  review_status: ReviewStatus | null;
  review_comment: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** 单据级别催收结果实体 */
export interface ArBillResult {
  id: number;
  customer_task_id: number;
  ar_id: number;
  result_type: CollectionResultType;
  latest_pay_date: Date | null;
  evidence_url: string | null;
  remark: string | null;
  created_at: Date;
  updated_at: Date;
}

/** 客户催收任务关联的单据详情 */
export interface ArCustomerTaskBill {
  ar_id: number;
  erp_bill_id: string;
  order_no: string | null;
  left_amount: number;
  due_date: Date;
  overdue_days: number;
  ar_status: ArStatus;
  bill_result_type?: CollectionResultType;
  bill_latest_pay_date?: Date;
}

/** 创建客户催收任务参数 */
export interface CreateCustomerTaskParams {
  consumerName: string;
  consumerCode?: string;
  managerUsers?: string;
  arIds: number[];
  collectorId: number;
  collectorRole: CollectorLevel;
}

/** 客户任务查询参数 */
export interface CustomerTaskQueryParams {
  userId?: number;
  status?: CollectionTaskStatus;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 统一提交催收结果参数 */
export interface SubmitUnifiedResultParams {
  customerTaskId: number;
  collectorId: number;
  resultType: CollectionResultType;
  latestPayDate?: Date;
  evidenceUrl?: string;
  signatureData?: string;
  escalateReason?: string;
  remark?: string;
}

/** 混合提交单据结果项 */
export interface MixedBillResultItem {
  arId: number;
  resultType: CollectionResultType;
  latestPayDate?: string;
  remark?: string;
}

/** 混合提交催收结果参数 */
export interface SubmitMixedResultsParams {
  customerTaskId: number;
  collectorId: number;
  bills: MixedBillResultItem[];
  evidenceUrl?: string;
  signatureData?: string;
}

/** 客户任务升级参数 */
export interface EscalateCustomerTaskParams {
  customerTaskId: number;
  collectorId: number;
  escalateReason: string;
}

// ==================== 逾期应收账款管理 ====================

/** 逾期等级 */
export type OverdueLevel = 'light' | 'medium' | 'severe';

/** 流程状态 */
export type FlowStatus = 'initial' | 'preprocessing' | 'assigned' | 'collecting' | 'completed';

/** 流程节点类型 */
export type FlowNodeType = 'preprocessing' | 'assignment' | 'collection' | 'review';

/** 流程节点状态 */
export type FlowNodeStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'timeout';

/** 时限配置实体 */
export interface ArDeadlineConfig {
  id: number;
  node_type: FlowNodeType;
  overdue_level: OverdueLevel;
  deadline_hours: number;
  warning_hours: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/** 流程节点记录实体 */
export interface ArFlowNode {
  id: number;
  customer_task_id: number;
  node_type: FlowNodeType;
  node_status: FlowNodeStatus;
  operator_id: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  deadline_at: Date | null;
  actual_hours: number | null;
  is_timeout: boolean;
  node_data: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

/** 逾期统计快照实体 */
export interface ArOverdueStats {
  id: number;
  stat_date: Date;
  total_customer_count: number;
  total_overdue_amount: number;
  total_bill_count: number;
  light_customer_count: number;
  light_amount: number;
  medium_customer_count: number;
  medium_amount: number;
  severe_customer_count: number;
  severe_amount: number;
  preprocessing_pending_count: number;
  assignment_pending_count: number;
  collection_pending_count: number;
}

/** 时效分析实体 */
export interface ArTimeEfficiency {
  id: number;
  customer_task_id: number;
  preprocessing_hours: number | null;
  assignment_hours: number | null;
  collection_hours: number | null;
  total_hours: number | null;
  preprocessing_on_time: boolean | null;
  assignment_on_time: boolean | null;
  collection_on_time: boolean | null;
  stat_date: Date | null;
}

/** 逾期统计响应 */
export interface OverdueStatsResponse {
  totalCustomerCount: number;
  totalOverdueAmount: number;
  totalBillCount: number;
  avgOverdueDays: number;
  timeoutWarningCount: number;
  levelDistribution: {
    light: { customerCount: number; amount: number; billCount: number };
    medium: { customerCount: number; amount: number; billCount: number };
    severe: { customerCount: number; amount: number; billCount: number };
  };
  flowStatus: {
    preprocessingPending: number;
    assignmentPending: number;
    collecting: number;
    reviewPending: number;
  };
}

/** 逾期查询参数 */
export interface OverdueQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  overdueLevel?: OverdueLevel;
  flowStatus?: FlowStatus;
}

/** 预处理操作参数 */
export interface PreprocessingStartParams {
  customerTaskId: number;
  operatorId: number;
}

/** 预处理完成参数 */
export interface PreprocessingCompleteParams {
  customerTaskId: number;
  operatorId: number;
  remark?: string;
}

/** 任务分配参数 */
export interface AssignmentParams {
  customerTaskId: number;
  collectorId: number;
  assignedBy: number;
}

/** 时限配置更新参数 */
export interface DeadlineConfigUpdateParams {
  deadlineHours: number;
  warningHours?: number;
  isActive?: boolean;
}

/** 超时预警项 */
export interface TimeoutWarningItem {
  customerTaskId: number;
  taskNo: string;
  consumerName: string;
  overdueLevel: OverdueLevel;
  currentNode: FlowNodeType;
  deadlineAt: Date;
  overdueSinceHours: number;
  collectorName: string | null;
}

/** 时效分析查询参数 */
export interface TimeEfficiencyQueryParams {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  overdueLevel?: OverdueLevel;
  nodeType?: FlowNodeType;
}

/** 时效分析响应 */
export interface TimeEfficiencyResponse {
  avgTotalHours: number;
  onTimeRate: number;
  timeoutCount: number;
  list: ArTimeEfficiency[];
  total: number;
}

/** 客户逾期分析项 */
export interface CustomerOverdueItem {
  consumerName: string;
  consumerCode: string | null;
  billCount: number;
  totalAmount: number;
  maxOverdueLevel: OverdueLevel;
  maxOverdueDays: number;
  collectorName: string | null;
  flowStatus: FlowStatus;
}

/** 客户逾期分析查询参数 */
export interface CustomerOverdueQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  overdueLevel?: OverdueLevel;
}

/** 绩效统计响应 */
export interface PerformanceStatsResponse {
  totalTasks: number;
  completedTasks: number;
  avgCollectionHours: number;
  successRate: number;
  collectors: CollectorPerformance[];
}

/** 催收人员绩效 */
export interface CollectorPerformance {
  collectorId: number;
  collectorName: string;
  taskCount: number;
  completedCount: number;
  successRate: number;
  avgHours: number;
  timeoutCount: number;
}
