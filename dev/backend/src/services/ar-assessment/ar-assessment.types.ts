/**
 * 催收考核管理 - 类型定义与规则常量
 */

/** 考核层级 */
export type AssessmentTier = 'tier1' | 'tier2' | 'tier3';

/** 被考核角色 */
export type AssessmentRole = 'marketer' | 'marketing_supervisor';

/** 考核状态 */
export type AssessmentStatus = 'pending' | 'handled' | 'skipped';

/** 考核记录 */
export interface AssessmentRecord {
  id: number;
  taskId: number;
  taskNo?: string;
  consumerName?: string;
  assessmentTier: AssessmentTier;
  assessmentUserId: number;
  assessmentUserName: string;
  assessmentRole: AssessmentRole;
  baseAmount: number;
  overdueDays: number;
  penaltyAmount: number;
  assessmentRuleSnapshot: Record<string, any> | null;
  status: AssessmentStatus;
  handleRemark: string | null;
  handledBy: number | null;
  handledAt: Date | null;
  calculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** 考核查询参数 */
export interface AssessmentQueryParams {
  page?: number;
  pageSize?: number;
  assessmentTier?: AssessmentTier;
  assessmentUserId?: number;
  assessmentRole?: AssessmentRole;
  status?: AssessmentStatus;
  startDate?: string;
  endDate?: string;
  keyword?: string;
}

/** 考核列表结果 */
export interface AssessmentListResult {
  data: AssessmentRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 考核统计 */
export interface AssessmentStats {
  totalAmount: number;
  pendingCount: number;
  pendingAmount: number;
  handledCount: number;
  handledAmount: number;
  skippedCount: number;
  skippedAmount: number;
  userCount: number;
  todayCount: number;
  todayAmount: number;
  byTier: Array<{
    tier: AssessmentTier;
    tierName: string;
    count: number;
    amount: number;
  }>;
}

/** 考核计算结果 */
export interface CalculationResult {
  tier: AssessmentTier;
  processedCount: number;
  createdCount: number;
}

/** 层级名称映射 */
export const TIER_NAMES: Record<AssessmentTier, string> = {
  tier1: '一级考核(3-5天)',
  tier2: '二级考核(5-7天)',
  tier3: '三级考核(7天以上)',
};

/** 角色名称映射 */
export const ROLE_NAMES: Record<AssessmentRole, string> = {
  marketer: '营销师',
  marketing_supervisor: '营销主管',
};

/** 状态名称映射 */
export const STATUS_NAMES: Record<AssessmentStatus, string> = {
  pending: '未标记',
  handled: '已处理',
  skipped: '无需处理',
};

/** 核心考核规则 */
export const ASSESSMENT_RULES = {
  tier1: {
    name: '一级考核(3-5天)',
    minDays: 3,
    maxDays: 5,
    marketerAmount: 10,
    supervisorAmount: 20,
  },
  tier2: {
    name: '二级考核(5-7天)',
    minDays: 5,
    maxDays: 7,
    marketerAmount: 20,
    supervisorAmount: 40,
  },
  tier3: {
    name: '三级考核(7天以上)',
    minDays: 7,
    maxDays: null,
    marketerRatio: 0.7,
    supervisorRatio: 0.3,
  },
} as const;

/** 下一级考核预告（按角色区分） */
export const NEXT_TIER_WARNING: Record<AssessmentTier, Record<AssessmentRole, string> | null> = {
  tier1: {
    marketer: '若5天内仍未处理，将触发二级考核：20元/次',
    marketing_supervisor: '若5天内仍未处理，将触发二级考核：40元/次',
  },
  tier2: {
    marketer: '若7天内仍未处理，将触发三级考核：按欠款金额全额的70%考核',
    marketing_supervisor: '若7天内仍未处理，将触发三级考核：按欠款金额全额的30%考核',
  },
  tier3: null,
};

/** 最高级别固定文案 */
export const MAX_TIER_WARNING = '已是最高级别考核，请务必尽快处理！';
