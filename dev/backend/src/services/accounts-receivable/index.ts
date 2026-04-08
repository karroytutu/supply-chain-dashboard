/**
 * 应收账款管理模块入口
 */

// 类型导出
export type {
  ArReceivable,
  ArCollectionTask,
  ArPenaltyRecord,
  ArNotificationRecord,
  ArSyncResult,
  ArQueryParams,
  ArListResult,
  ArStats,
  AgingAnalysis,
} from './ar.types';

export type {
  ArStatus,
  CollectorLevel,
  CollectionTaskStatus,
  CollectionResultType,
  ReviewStatus,
  PenaltyLevel,
  NotificationType,
  NotificationStatus,
} from './ar.types';

// 同步服务导出
export { syncArReceivables } from './ar-sync.service';

// 签名服务
export { saveSignature, getUserSignatures, setDefaultSignature, deleteSignature } from './ar-signature.service';

// 通知服务
export {
  runDailyNotificationTask,
  sendPendingReviewNotification,
  sendReviewResultNotification,
  sendPaymentConfirmedNotification,
  sendEscalateNotification,
  sendGuaranteeNotification,
  matchMarketingUser,
  saveNotificationRecord,
  sendAndRecordNotification,
  hasNotifiedToday,
} from './ar-notification.service';

export type { MarketingUser } from './ar-notification.service';

// 通知模板
export type { BillDetail, DailySummaryStats } from './ar-notification-templates';
export {
  buildPreWarn5Message,
  buildPreWarn2Message,
  buildOverdueCollectMessage,
  buildTimeoutPenaltyMessage,
  buildEscalateMessage,
  buildAutoEscalateMessage,
  buildPendingReviewMessage,
  buildReviewResultMessage,
  buildPaymentConfirmedMessage,
  buildGuaranteeNotifyMessage,
  buildDailySummaryMessage,
  getNotificationTitle,
} from './ar-notification-templates';

// 催收服务
export {
  getCollectionTasks,
  submitCustomerDelay,
  submitGuaranteeDelay,
  submitPaidOff,
  submitEscalate,
  getCollectionTaskDetail,
} from './ar-collection.service';

// 审核服务
export { getReviewTasks, approveReview, rejectReview, getHistoryRecords } from './ar-review.service';

// 统计快照服务
export {
  calculateCurrentStats,
  saveDailySnapshot,
  getLastMonthEndStats,
  getArStatsWithComparison,
} from './ar-stats.service';
export type { ArDailyStats, ArStatsResponse } from './ar-stats.service';

// 逾期管理类型导出
export type {
  OverdueLevel,
  FlowStatus,
  FlowNodeType,
  FlowNodeStatus,
  ArDeadlineConfig,
  ArFlowNode,
  ArOverdueStats,
  ArTimeEfficiency,
  OverdueStatsResponse,
  OverdueQueryParams,
  PreprocessingStartParams,
  PreprocessingCompleteParams,
  AssignmentParams,
  DeadlineConfigUpdateParams,
  TimeoutWarningItem,
  TimeEfficiencyQueryParams,
  TimeEfficiencyResponse,
  CustomerOverdueItem,
  CustomerOverdueQueryParams,
  PerformanceStatsResponse,
  CollectorPerformance,
} from './ar.types';

// 逾期管理服务
export {
  calculateOverdueLevel,
  updateOverdueLevels,
  getCustomerOverdueLevel,
  getBatchCustomerOverdueLevels,
  getDeadlineConfigs,
  updateDeadlineConfig,
  calculateNodeDeadline,
  getDeadlineHours,
  calculateBatchNodeDeadlines,
  getWarningHours,
  clearDeadlineConfigCache,
  getOverdueStats,
  saveOverdueSnapshot,
  getOverdueSnapshots,
  // 预处理服务
  getPreprocessingList,
  startPreprocessing,
  completePreprocessing,
  batchStartPreprocessing,
  batchCompletePreprocessing,
  getPreprocessingTaskBills,
  // 任务分配服务
  getAssignmentList,
  assignTask,
  batchAssignTasks,
  getAvailableCollectors,
  // 超时预警服务
  checkTimeoutTasks,
  getTimeoutWarnings,
  processTimeoutWarnings,
} from './overdue';
