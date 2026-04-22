/**
 * 催收考核类型定义
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
  status: AssessmentStatus;
  handleRemark?: string;
  handledBy?: number;
  handledAt?: string;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
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
  byTier: {
    tier: AssessmentTier;
    tierName: string;
    count: number;
    amount: number;
  }[];
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
