/**
 * 应收账款全景看板 - 后端类型定义
 * 与前端 ar-dashboard.d.ts 对齐，但不含 UI 属性（valueColor 等由前端映射）
 */

// ============================================
// 看板聚合响应
// ============================================

/** 弹窗预计算数据（随主接口一并返回，前端弹窗直接使用，无需额外请求） */
export interface ArDashboardPopupData {
  /** 即将逾期客户聚合（KPI 卡片弹窗） */
  upcomingExpiryCustomers: UpcomingExpiryCustomerDTO[];
  /** 管道超时明细，key = "status" 或 "status:L1"/"status:L2" */
  pipelineTimeoutDetails: Record<string, PipelineTimeoutDetailDTO[]>;
  /** 诉讼进度明细，key = category (noticeSent/lawsuitFiled/lawsuitInProgress/lawsuitCompleted) */
  legalProgressDetails: Record<string, LegalProgressDetailDTO[]>;
}

/** 看板完整数据（overview 接口响应） */
export interface ArDashboardOverview {
  kpiCards: KpiCardDTO[];
  pipeline: {
    nodes: PipelineNodeDTO[];
    legalProgress: LegalProgressDTO;
  };
  marketers: MarketerStatsDTO[];
  details: ArDetailRowDTO[];
  marketerOptions: { value: string; label: string }[];
  /** 弹窗预计算数据 */
  popupData: ArDashboardPopupData;
  updatedAt: string;
}

// ============================================
// KPI 卡片
// ============================================

export interface KpiCardDTO {
  key: string;
  title: string;
  value: number | null;
  unit: string;
  /** 辅助信息（即将逾期的涉及金额、涉及客户） */
  auxiliary?: { label: string; value: string }[];
}

// ============================================
// 催收管道
// ============================================

/** 催收任务状态（与前端 CollectionTaskStatus 对齐） */
export type CollectionTaskStatus =
  | 'collecting'
  | 'difference_processing'
  | 'extension'
  | 'escalated';

export type PendingRole = 'marketer' | 'supervisor' | 'finance';

export interface PipelineNodeDTO {
  status: CollectionTaskStatus;
  label: string;
  count: number;
  amount: number;
  pendingRole: PendingRole;
  /** 升级层级（仅 escalated 状态使用） */
  escalationLevel?: 1 | 2;
  /** 即将超时笔数（OA 节点 deadline_at 维度，剩余 ≤24h） */
  upcomingTimeoutCount?: number;
  /** 已超时笔数（OA 节点 deadline_at 已过期） */
  overdueTimeoutCount?: number;
}

// ============================================
// 诉讼进度
// ============================================

export interface LegalProgressDTO {
  /** 催收函已发送 */
  noticeSent: number;
  /** 已提起诉讼 */
  lawsuitFiled: number;
  /** 诉讼进行中 */
  lawsuitInProgress: number;
  /** 已判决/执行 */
  lawsuitCompleted: number;
}

// ============================================
// 营销师维度
// ============================================

export interface MarketerStatsDTO {
  marketerId: number | null;
  marketerName: string;
  /** 欠款客户数 */
  debtCustomerCount: number;
  /** 欠款总额 */
  debtAmount: number;
  /** 逾期客户数 */
  overdueCustomerCount: number;
  /** 逾期总额 */
  overdueAmount: number;
  /** DSO（全局值，非营销师维度） */
  dso: number | null;
  /** 催收中任务数 */
  collectingCount: number;
}

// ============================================
// 明细表
// ============================================

export interface ArDetailRowDTO {
  billNo: string;
  consumerName: string;
  billTypeName: string;
  totalAmount: number;
  leftAmount: number;
  billOrderTime: string;
  expireTime: string;
  overdueDays: number;
  /** 账龄区间（JS 层根据 overdueDays 计算） */
  agingBucket: string;
  /** 授信额度（来自 ERP 客户限额） */
  creditLimit: number | null;
  /** 催收状态（null 表示未入催） */
  status: CollectionTaskStatus | null;
  escalationLevel?: 1 | 2;
  managerUserName: string;
  /** OA 审批实例 ID，用于跳转详情页 */
  oaInstanceId?: number;
  /** OA 单号，显示用 */
  oaInstanceNo?: string;
  /** 入催日期（OA 实例提交时间） */
  collectionStartDate?: string;
  /** 当前节点截止时间（OA 节点 deadline_at） */
  deadlineAt?: string;
}

// ============================================
// 弹窗数据
// ============================================

/** 即将逾期客户维度（KPI 卡片弹窗） */
export interface UpcomingExpiryCustomerDTO {
  consumerName: string;
  billCount: number;
  totalAmount: number;
  nearestExpireDate: string;
  managerUserName: string;
}

/** 管道节点即将逾期明细（管道节点弹窗） */
export interface PipelineExpiryDetailDTO {
  billNo: string;
  consumerName: string;
  leftAmount: number;
  expireTime: string;
  daysToExpire: number;
  managerUserName: string;
}

/** 管道节点超时明细（催收进度弹窗 — 时限维度） */
export interface PipelineTimeoutDetailDTO {
  instanceId: number;
  instanceNo: string;
  consumerName: string;
  /** 涉及金额（OA 表单 totalAmount） */
  totalAmount: number;
  collectionStartDate: string;
  deadlineAt: string;
  /** 剩余小时数（正=剩余，负=已超时） */
  remainingHours: number;
  managerUserName: string;
  isOverdue: boolean;
}

/** 诉讼进度明细（诉讼进度弹窗） */
export interface LegalProgressDetailDTO {
  /** OA 实例 ID，用于跳转详情页 */
  instanceId: number;
  /** OA 单号，显示用 */
  instanceNo: string;
  /** 操作类型：send_letter / lawsuit */
  action: string;
  /** OA 审批状态 */
  status: string;
  consumerName: string;
  totalAmount: number;
  submittedAt: string;
  currentApprover: string;
}

// ============================================
// 内部中间类型（共享数据上下文）
// ============================================

/** OA 催收实例行（SQL 查询结果） */
export interface OaCollectionInstanceRow {
  id: number;
  instance_no: string;
  submitted_at: Date;
  status: string;
  form_data: Record<string, unknown> | null;
  current_node_order: number;
  role_code: string | null;
  node_name: string | null;
  node_status: string | null;
  deadline_at: Date | null;
}

/** OA 催收表单数据结构（form_data 的类型化断言） */
export interface CollectionFormData {
  action?: string;
  totalAmount?: string | number;
  consumerName?: string;
  managerName?: string;
}

/** 看板共享数据上下文 */
export interface DashboardContext {
  enrichedDebts: import('../erp-debt/erp-debt.types').EnrichedDebtRecord[];
  oaInstances: OaCollectionInstanceRow[];
  upcomingWarnings: import('../ar-collection/ar-warning.query').UpcomingWarningDetail[];
  dsoValue: number | null;
}
