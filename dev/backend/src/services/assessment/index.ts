/**
 * 统一考核管理模块 - 导出入口
 */

// 类型导出
export type {
  AssessmentCategory,
  ArCollectionRuleType,
  ReturnOrderRuleType,
  AssessmentRuleType,
  AssessmentStatus,
  AssessmentRole,
  AssessmentRecordRow,
  AssessmentRecordDTO,
  AssessmentQueryParams,
  AssessmentStatsRow,
  AssessmentStatsDTO,
  CalculationContext,
  CalculationResult,
  NotificationContent,
} from './assessment.types';

export {
  ASSESSMENT_STATUS_LABELS,
  ASSESSMENT_ROLE_LABELS,
  ASSESSMENT_CATEGORY_LABELS,
} from './assessment.types';

// 规则注册表
export type { AssessmentRuleDefinition } from './assessment.rules';
export {
  registerAssessmentRule,
  getAssessmentRule,
  getRulesByCategory,
  getAllRules,
  getMatchingRules,
  isTransitionAllowed,
  DEFAULT_ALLOWED_TRANSITIONS,
  DEFAULT_STATUS_LABELS,
} from './assessment.rules';

// Repository 数据访问层
export * as assessmentRepository from './assessment.repository';

// Mapper DTO 映射层
export { toDTO, toDTOList, toStatsDTO } from './assessment.mapper';

// 规则注册（导入即执行注册）
import './rules/ar-collection-rules';
import './rules/return-order-rules';

// 计算引擎
export { runCalculation } from './assessment-calculate';

// 通知
export { sendAssessmentNotifications } from './assessment-notify';

// 业务服务
export {
  getAssessmentRecords,
  getAssessmentStats,
  getMyAssessments,
  getAssessmentById,
  handleAssessment,
  submitAppeal,
  updateAssessmentStatusByAppeal,
  triggerCalculation,
  getCategoriesConfig,
} from './assessment.service';

// 工具函数
export { getUsersByRole, findUserByName, getPurchasePrice, getDingtalkUserIdMap } from './utils';
