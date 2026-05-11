/**
 * 统一考核类型定义
 * 覆盖催收考核和退货考核的统一数据结构
 */

// ==================== 考核分类 ====================
declare type AssessmentCategory = 'ar_collection' | 'return_order';
declare type AssessmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'appealed';
declare type AssessmentRole =
  | 'marketer'
  | 'procurement_manager'
  | 'marketing_manager'
  | 'marketing_supervisor'
  | 'warehouse_manager'
  | 'warehouse_keeper'
  | 'logistics_manager';

// ==================== 考核记录 ====================
declare interface AssessmentRecord {
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

// ==================== 统计数据 ====================
declare interface AssessmentStats {
  totalAmount: number;
  pendingCount: number;
  pendingAmount: number;
  confirmedCount: number;
  todayNew: number;
  involvedUsers: number;
}

// ==================== 查询参数 ====================
declare interface AssessmentQueryParams {
  category?: AssessmentCategory;
  status?: AssessmentStatus;
  ruleType?: string;
  role?: AssessmentRole;
  keyword?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

// ==================== 操作请求 ====================
declare interface AssessmentActionRequest {
  action: 'confirm' | 'cancel';
  remark?: string;
}

declare interface AssessmentAppealRequest {
  reason: string;
  documents?: string[];
}

declare interface AssessmentAppealResponse {
  oaInstanceId: number;
  message: string;
}

// ==================== 分类配置 ====================
declare interface AssessmentCategoryConfig {
  category: AssessmentCategory;
  label: string;
  rules: Array<{
    ruleType: string;
    name: string;
    description: string;
  }>;
}

// ==================== 计算请求 ====================
declare interface AssessmentCalculateRequest {
  category?: AssessmentCategory;
  ruleType?: string;
}

// ==================== API 响应 ====================
declare interface AssessmentListResponse {
  list: AssessmentRecord[];
  total: number;
}
