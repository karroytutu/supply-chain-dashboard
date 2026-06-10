/**
 * 应收账款全景看板 - 类型定义
 * 与后端 ar-dashboard.types.ts 对齐
 */

// ============================================
// KPI 指标
// ============================================

/** KPI 卡片数据（API 返回，valueColor 由前端注入） */
interface KpiCardData {
  key: string;
  title: string;
  value: number | null;
  unit?: string;
  /** UI 颜色（前端从 KPI_COLOR_MAP 注入，不来自 API） */
  valueColor?: string;
  /** 辅助信息（如即将逾期的笔数+金额） */
  auxiliary?: { label: string; value: string }[];
}

// ============================================
// 催收进度管道
// ============================================

/** 催收任务状态（与后端对齐）
 * 注: 'closed' 为预留状态，后端当前不返回，未来支持结案操作时使用
 */
type CollectionTaskStatus =
  | 'collecting'
  | 'difference_processing'
  | 'extension'
  | 'escalated'
  | 'closed';

/** 待处理角色 */
type PendingRole = 'marketer' | 'supervisor' | 'finance';

/** 升级层级（用于区分 escalated 下的 L1/L2） */
type EscalationLevel = 1 | 2;

/** 催收进度节点（API 返回，color 由前端注入） */
interface PipelineNode {
  status: CollectionTaskStatus;
  label: string;
  count: number;
  amount: number;
  /** UI 颜色（前端从 NODE_COLOR_MAP 注入） */
  color?: string;
  pendingRole: PendingRole;
  escalationLevel?: EscalationLevel;
  upcomingExpiryCount?: number;
}

/** 诉讼进度统计 */
interface LegalProgressStats {
  noticeSent: number;
  lawsuitFiled: number;
  lawsuitInProgress: number;
  lawsuitCompleted: number;
}

// ============================================
// 营销师维度
// ============================================

/** 营销师统计数据 */
interface MarketerStats {
  marketerId: number | null;
  marketerName: string;
  debtCustomerCount: number;
  debtAmount: number;
  overdueCustomerCount: number;
  overdueAmount: number;
  dso: number | null;
  collectingCount: number;
}

// ============================================
// 应收账款明细
// ============================================

/** 明细表行数据 */
interface ArDetailRow {
  billNo: string;
  consumerName: string;
  billTypeName: string;
  totalAmount: number;
  leftAmount: number;
  billOrderTime: string;
  expireTime: string;
  overdueDays: number;
  agingBucket: string;
  creditLimit: number | null;
  /** 催收状态（null 表示未入催） */
  status: CollectionTaskStatus | null;
  escalationLevel?: EscalationLevel;
  managerUserName: string;
}

// ============================================
// 弹窗数据
// ============================================

/** 即将逾期客户维度数据 */
interface UpcomingExpiryCustomer {
  consumerName: string;
  billCount: number;
  totalAmount: number;
  nearestExpireDate: string;
  managerUserName: string;
}

/** 管道节点即将逾期明细 */
interface PipelineExpiryDetail {
  billNo: string;
  consumerName: string;
  leftAmount: number;
  expireTime: string;
  daysToExpire: number;
  managerUserName: string;
}

/** 管道联动筛选参数 */
interface PipelineFilter {
  status: CollectionTaskStatus | '';
  escalationLevel?: EscalationLevel;
}

/** 明细表本地筛选状态 */
interface ArDetailFilters {
  status?: CollectionTaskStatus | '';
  escalationLevel?: EscalationLevel;
  overdueRange: string;
  managerName?: string;
  keyword: string;
}

// ============================================
// 看板聚合数据（API 响应类型）
// ============================================

/** 看板完整数据（后端 API 响应） */
interface ArDashboardData {
  kpiCards: KpiCardData[];
  pipeline: {
    nodes: PipelineNode[];
    legalProgress: LegalProgressStats;
  };
  marketers: MarketerStats[];
  details: ArDetailRow[];
  marketerOptions: { value: string; label: string }[];
  updatedAt: string;
}
