/**
 * 统一考核管理 - 核心类型定义
 * 包含枚举、数据库行类型、DTO、查询参数、统计、计算相关类型
 */

// ==================== 枚举类型 ====================

/** 考核分类 */
export type AssessmentCategory = 'ar_collection' | 'return_order' | 'credit_license';

/**
 * 规则类型按 category 区分:
 * - ar_collection: 'tier1' | 'tier2' | 'tier3'
 * - return_order: 'procurement_confirm_timeout' | 'marketing_sales_timeout' | 'return_expire_insufficient' | 'erp_entry_timeout' | 'warehouse_execute_timeout'
 */
export type ArCollectionRuleType = 'tier1' | 'tier2' | 'tier3';
export type ReturnOrderRuleType = 'procurement_confirm_timeout' | 'marketing_sales_timeout' | 'return_expire_insufficient' | 'erp_entry_timeout' | 'warehouse_execute_timeout';
export type CreditLicenseRuleType = 'license_timeout';
export type AssessmentRuleType = ArCollectionRuleType | ReturnOrderRuleType | CreditLicenseRuleType;

/** 考核记录状态 */
export type AssessmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'appealed';

/** 被考核角色 */
export type AssessmentRole = 'marketer' | 'marketing_supervisor' | 'procurement_manager' | 'marketing_manager' | 'warehouse_manager' | 'warehouse_keeper' | 'logistics_manager';

// ==================== 数据库行类型 (snake_case) ====================

/** 考核记录数据库行 */
export interface AssessmentRecordRow {
  id: number;
  category: AssessmentCategory;
  rule_type: string;
  source_type: string;  // 'ar_collection_task' | 'expiring_return_order'
  source_id: number;
  source_no: string | null;
  source_name: string | null;
  assessment_user_id: number;
  assessment_user_name: string | null;
  assessment_role: AssessmentRole;
  base_amount: string | null;       // DECIMAL 返回 string
  penalty_rate: string | null;
  overdue_days: number;
  penalty_amount: string;
  status: AssessmentStatus;
  handle_remark: string | null;
  handled_by: number | null;
  handled_at: string | null;
  oa_instance_id: number | null;
  appeal_reason: string | null;
  appeal_submitted_at: string | null;
  rule_snapshot: Record<string, unknown> | null;
  calculated_at: string;
  created_at: string;
  updated_at: string;
}

// ==================== DTO 类型 (camelCase) ====================

/** 考核记录 DTO（API 响应） */
export interface AssessmentRecordDTO {
  id: number;
  category: AssessmentCategory;
  ruleType: string;
  sourceType: string;
  sourceId: number;
  sourceNo: string | null;
  sourceName: string | null;
  assessmentUserId: number;
  assessmentUserName: string | null;
  assessmentRole: AssessmentRole;
  baseAmount: number | null;
  penaltyRate: number | null;
  overdueDays: number;
  penaltyAmount: number;
  status: AssessmentStatus;
  handleRemark: string | null;
  handledBy: number | null;
  handledAt: string | null;
  oaInstanceId: number | null;
  appealReason: string | null;
  appealSubmittedAt: string | null;
  ruleSnapshot: Record<string, unknown> | null;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 查询参数 ====================

/** 考核记录查询参数 */
export interface AssessmentQueryParams {
  category?: AssessmentCategory;
  status?: AssessmentStatus;
  rule_type?: string;
  role?: AssessmentRole;
  keyword?: string;
  start_date?: string;
  end_date?: string;
  page: number;
  page_size: number;
}

// ==================== 统计类型 ====================

/** 考核统计数据 - DB 查询结果（snake_case，内部使用） */
export interface AssessmentStatsRow {
  total_amount: number;
  pending_count: number;
  pending_amount: number;
  confirmed_count: number;
  today_new: number;
  involved_users: number;
}

/** 考核统计数据 - API 对外 DTO（camelCase） */
export interface AssessmentStatsDTO {
  totalAmount: number;
  pendingCount: number;
  pendingAmount: number;
  confirmedCount: number;
  todayNew: number;
  involvedUsers: number;
}

// ==================== 计算相关 ====================

/** 计算上下文（触发计算时的参数） */
export interface CalculationContext {
  triggered_by: 'scheduled' | 'manual' | 'realtime';
  category?: AssessmentCategory;
  rule_type?: string;
  source_id?: number;
}

/** 计算结果（单条考核记录的计算产出） */
export interface CalculationResult {
  category: AssessmentCategory;
  rule_type: string;
  source_type: string;
  source_id: number;
  source_no: string;
  source_name: string;
  assessment_user_id: number;
  assessment_user_name: string;
  assessment_role: AssessmentRole;
  base_amount: number;
  penalty_rate: number;
  overdue_days: number;
  penalty_amount: number;
  rule_snapshot: Record<string, unknown>;
}

// ==================== 通知相关 ====================

/** 钉钉通知内容 */
export interface NotificationContent {
  title: string;
  markdown: string;
}

// ==================== 状态标签 ====================

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  pending: '待处理',
  confirmed: '已处理',
  cancelled: '无需考核',
  appealed: '申诉中',
};

// ==================== 角色标签 ====================

export const ASSESSMENT_ROLE_LABELS: Record<AssessmentRole, string> = {
  marketer: '营销师',
  marketing_supervisor: '营销主管',
  procurement_manager: '采购主管',
  marketing_manager: '营销经理',
  warehouse_manager: '仓储主管',
  warehouse_keeper: '仓储人员',
  logistics_manager: '物流经理',
};

// ==================== 分类标签 ====================

export const ASSESSMENT_CATEGORY_LABELS: Record<AssessmentCategory, string> = {
  ar_collection: '催收考核',
  return_order: '退货考核',
  credit_license: '执照考核',
};
