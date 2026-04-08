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

// ==================== 客户维度催收任务类型 ====================

/** 客户催收结果类型（包含混合） */
export type CustomerCollectionResultType = CollectionResultType | 'mixed';

/** 客户催收任务 */
export interface ArCustomerCollectionTask {
  id: number;
  task_no: string;
  consumer_name: string;
  consumer_code?: string;
  ar_ids: number[];
  total_amount: number;
  bill_count: number;
  collector_id: number;
  collector_role: CollectorLevel;
  collector_name?: string;
  deadline_at: string;
  status: CollectionTaskStatus;
  result_type: CustomerCollectionResultType | null;
  latest_pay_date: string | null;
  evidence_url: string | null;
  signature_data: string | null;
  escalate_reason: string | null;
  reviewed_by: number | null;
  reviewer_name?: string;
  review_status: ReviewStatus | null;
  review_comment: string | null;
  completed_at: string | null;
  timeout_days?: number;
  penalty_amount?: number;
  remaining_hours?: number;
  created_at: string;
  updated_at: string;
}

/** 单据催收结果（用于混合操作） */
export interface ArBillResult {
  id?: number;
  customer_task_id: number;
  ar_id: number;
  result_type: CollectionResultType;
  latest_pay_date?: string;
  erp_bill_id?: string;
  left_amount?: number;
  due_date?: string;
  overdue_days?: number;
}

/** 客户任务明细（含单据列表） */
export interface CustomerTaskDetail extends ArCustomerCollectionTask {
  bills: CustomerTaskBill[];
}

/** 客户任务关联的单据信息 */
export interface CustomerTaskBill {
  ar_id: number;
  erp_bill_id: string;
  order_no: string | null;
  left_amount: number;
  due_date: string;
  overdue_days: number;
  bill_order_time?: string;
  settle_method?: number;
  max_debt_days?: number;
  result_type?: CollectionResultType;
  latest_pay_date?: string;
}

/** 客户任务查询参数 */
export interface CustomerTaskQueryParams {
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 客户催收结果提交参数（统一操作） */
export interface CustomerCollectionSubmitParams {
  resultType: CollectionResultType;
  latestPayDate?: string;
  evidenceUrl?: string;
  signatureData?: string;
  escalateReason?: string;
  remark?: string;
}

/** 客户催收混合结果提交参数 */
export interface CustomerMixedSubmitParams {
  bills: Array<{
    arId: number;
    resultType: CollectionResultType;
    latestPayDate?: string;
  }>;
  evidenceUrl?: string;
  signatureData?: string;
}

/** 客户快速延期参数 */
export interface CustomerQuickDelayParams {
  days: number;
}

/** 客户任务升级参数 */
export interface CustomerEscalateParams {
  escalateReason: string;
}

/** 客户审核任务查询参数 */
export interface CustomerReviewQueryParams {
  reviewType?: string;
  page?: number;
  pageSize?: number;
}

/** 客户审核操作参数 */
export interface CustomerReviewActionParams {
  action: 'approve' | 'reject';
  comment?: string;
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

/** 逾期等级标签映射 */
export interface OverdueLevelMap {
  light: string;
  medium: string;
  severe: string;
}

/** 时限配置 */
export interface ArDeadlineConfig {
  id: number;
  nodeType: string;
  overdueLevel: OverdueLevel;
  deadlineHours: number;
  warningHours: number;
  isActive: boolean;
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

/** 逾期任务列表项 */
export interface OverdueTaskItem {
  id: number;
  taskNo: string;
  consumerName: string;
  consumerCode: string | null;
  managerUsers: string | null;
  billCount: number;
  totalAmount: number;
  overdueLevel: OverdueLevel;
  flowStatus: FlowStatus;
  preprocessingStatus: string | null;
  collectorName: string | null;
  deadlineAt: string | null;
  createdAt: string;
}

/** 超时预警项 */
export interface TimeoutWarningItem {
  customerTaskId: number;
  taskNo: string;
  consumerName: string;
  overdueLevel: OverdueLevel;
  currentNode: FlowNodeType;
  deadlineAt: string;
  overdueSinceHours: number;
  collectorName: string | null;
}

/** 时效分析项 */
export interface TimeEfficiencyItem {
  id: number;
  customerTaskId: number;
  taskNo: string;
  consumerName: string;
  preprocessingHours: number | null;
  assignmentHours: number | null;
  collectionHours: number | null;
  totalHours: number | null;
  preprocessingOnTime: boolean | null;
  assignmentOnTime: boolean | null;
  collectionOnTime: boolean | null;
  statDate: string | null;
}

/** 时效分析响应 */
export interface TimeEfficiencyResponse {
  avgTotalHours: number;
  onTimeRate: number;
  timeoutCount: number;
  list: TimeEfficiencyItem[];
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

/** 绩效统计响应 */
export interface PerformanceStatsResponse {
  totalTasks: number;
  completedTasks: number;
  avgCollectionHours: number;
  successRate: number;
  collectors: CollectorPerformance[];
}

/** 可分配催收人员 */
export interface AvailableCollector {
  id: number;
  name: string;
  taskCount: number;
}

/** 逾期任务查询参数 */
export interface OverdueTaskQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  overdueLevel?: OverdueLevel;
}

/** 时效分析查询参数 */
export interface TimeEfficiencyQueryParams {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
  overdueLevel?: OverdueLevel;
}

/** 绩效统计查询参数 */
export interface PerformanceQueryParams {
  startDate?: string;
  endDate?: string;
}

/** 开始预处理参数 */
export interface StartPreprocessingParams {
  customerTaskId: number;
}

/** 完成预处理参数 */
export interface CompletePreprocessingParams {
  customerTaskId: number;
  remark?: string;
}

/** 分配任务参数 */
export interface AssignOverdueTaskParams {
  customerTaskId: number;
  collectorId: number;
}

/** 更新时限配置参数 */
export interface UpdateDeadlineConfigParams {
  deadlineHours: number;
  warningHours?: number;
  isActive?: boolean;
}

// ==================== 预处理订单明细类型 ====================

/** 预处理订单明细 */
export interface PreprocessingBillDetail {
  receivable: ArReceivable & { overdue_days: number };
  actionLogs: ArActionLog[];
}

/** 预处理任务订单明细响应 */
export interface PreprocessingTaskBillsResponse {
  taskInfo: {
    id: number;
    taskNo: string;
    consumerName: string;
    totalAmount: number;
    billCount: number;
    overdueLevel: OverdueLevel;
  };
  bills: PreprocessingBillDetail[];
}
