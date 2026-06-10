/**
 * 应收账款全景看板 - 类型定义
 * 前端原型使用，后续对接后端 API 时扩展
 */

// ============================================
// KPI 指标
// ============================================

/** 趋势方向（后续对接 API 时使用，当前 Mock 数据未设置） */
type TrendDirection = 'up' | 'down' | 'flat';

/** KPI 卡片数据 */
interface KpiCardData {
  key: string;
  title: string;
  value: number;
  unit?: string;
  prefix?: React.ReactNode;
  valueColor: string;
  trend?: number;
  trendDirection?: TrendDirection;
  /** 辅助信息（如即将逾期的笔数+金额） */
  auxiliary?: { label: string; value: string }[];
}

// ============================================
// 催收进度管道
// ============================================

/** 催收任务状态（与后端 TaskStatus 对齐） */
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

/** 催收进度节点（按角色分组） */
interface PipelineNode {
  status: CollectionTaskStatus;
  label: string;
  count: number;
  amount: number;
  color: string;
  /** 待处理角色，用于按角色分组展示 */
  pendingRole: PendingRole;
  /** 升级层级（仅 escalated 状态使用） */
  escalationLevel?: EscalationLevel;
  /** 即将逾期笔数 */
  upcomingExpiryCount?: number;
}

/**
 * 角色分组汇总
 * @reserved 后续 API 对接时使用，当前页面直接通过 PipelineNode.pendingRole 分组
 */
interface RoleGroup {
  role: PendingRole;
  label: string;
  color: string;
  nodes: PipelineNode[];
  totalCount: number;
  totalAmount: number;
}

/** 诉讼进度统计 */
interface LegalProgressStats {
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

/** 营销师统计数据 */
interface MarketerStats {
  marketerId: number;
  marketerName: string;
  /** 欠款客户数 */
  debtCustomerCount: number;
  /** 欠款总额 */
  debtAmount: number;
  /** 逾期客户数 */
  overdueCustomerCount: number;
  /** 逾期总额 */
  overdueAmount: number;
  dso: number;
  collectingCount: number;
}

// ============================================
// 应收账款明细
// ============================================

/** 明细表行数据 */
interface ArDetailRow {
  id: number;
  billNo: string;
  consumerName: string;
  billTypeName: string;
  totalAmount: number;
  leftAmount: number;
  /** 单据日期 */
  billOrderTime: string;
  expireTime: string;
  overdueDays: number;
  /** 账龄区间 */
  agingBucket: string;
  /** 授信额度 */
  creditLimit: number;
  status: CollectionTaskStatus;
  /** 升级层级（仅 escalated 状态有值） */
  escalationLevel?: EscalationLevel;
  managerUserName: string;
}

// ============================================
// 即将逾期弹窗
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

/** 明细表筛选参数 */
interface ArDetailFilters {
  status?: CollectionTaskStatus | '';
  escalationLevel?: EscalationLevel;
  overdueRange: string;
  managerId?: number | '';
  keyword: string;
}

// ============================================
// 看板聚合数据
// ============================================

/**
 * 看板完整数据（聚合接口响应结构）
 * @reserved 后续对接后端 API 时作为响应类型使用
 */
interface ArDashboardData {
  kpiCards: KpiCardData[];
  pipeline: {
    nodes: PipelineNode[];
    roleGroups: { role: PendingRole; label: string; color: string }[];
    legalProgress: LegalProgressStats;
  };
  marketers: MarketerStats[];
  details: ArDetailRow[];
  /** 营销师选项列表 */
  marketerOptions: { value: number; label: string }[];
  /** 数据更新时间 */
  updatedAt: string;
}
