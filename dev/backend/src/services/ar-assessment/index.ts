/**
 * 催收考核模块导出
 */

// 类型定义
export type {
  AssessmentTier,
  AssessmentRole,
  AssessmentStatus,
  AssessmentRecord,
  AssessmentQueryParams,
  AssessmentListResult,
  AssessmentStats,
  CalculationResult,
} from './ar-assessment.types';

export {
  ASSESSMENT_RULES,
  TIER_NAMES,
  ROLE_NAMES,
  STATUS_NAMES,
  NEXT_TIER_WARNING,
  MAX_TIER_WARNING,
} from './ar-assessment.types';

// 计算服务
export { calculateArAssessments } from './ar-assessment-calculate';

// 查询服务
export {
  getAssessments,
  getMyAssessments,
  getAssessmentById,
  getAssessmentStats,
  updateAssessmentHandleStatus,
  getAssessmentsByTaskId,
} from './ar-assessment.service';

// 通知服务
export {
  sendAssessmentCreatedNotifications,
  notifyAssessmentCreated,
} from './ar-assessment-notify';
