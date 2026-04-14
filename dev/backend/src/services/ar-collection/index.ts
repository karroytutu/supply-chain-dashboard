/**
 * 催收管理模块入口
 *
 * 导出所有类型定义和服务函数
 */

// 类型导出
export * from './ar-collection.types';

// 同步任务导出
export {
  syncERPDebts,
  generateCollectionTasks,
  checkExtensionExpiry,
} from './ar-collection-sync.task';

// 统计服务
export {
  getCollectionStats,
  getMyTasks,
} from './ar-collection.stats';

// 查询服务
export {
  getCollectionTasks,
  getTaskById,
  getTaskDetails,
  getTaskActions,
  getLegalProgress,
  getHandlers,
} from './ar-collection.query';

// 变更服务
export {
  submitVerify,
  applyExtension,
  markDifference,
  escalateTask,
  confirmVerify,
  resolveDifference,
} from './ar-collection.mutation';

// 法律催收服务
export {
  sendCollectionNotice,
  fileLawsuit,
  updateLegalProgress,
} from './ar-collection.legal';

// 通知服务
export {
  sendCollectionNotification,
  sendCollectionNotificationByRole,
  buildExtensionExpiryMessage,
  buildEscalationMessage,
  buildVerifyResultMessage,
} from './ar-collection-notify';

// 定时提醒任务
export {
  checkExtensionExpiryReminders,
} from './ar-collection-reminder.task';

// 预警查询服务
export {
  getUpcomingWarnings,
  getWarningReminders,
  hasReminderSentToday,
  recordWarningReminder,
} from './ar-warning.query';

// 预警提醒任务
export {
  checkUpcomingOverdueReminders,
} from './ar-warning.task';

// 预警消息模板
export {
  buildUpcomingWarningMessage,
} from './ar-collection-notify';
