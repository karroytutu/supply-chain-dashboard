/**
 * 催收管理模块入口
 *
 * 仅导出催收领域服务函数和类型定义
 * 注：ERP 数据管道已迁移至 services/erp-debt/
 *     通知发送能力已抽取至 services/notification/
 */

// 类型导出
export * from './ar-collection.types';
export * from './ar-collection-entry-rules';

// 通知服务（消息模板和发送）
export {
  sendCollectionNotification,
  sendCollectionNotificationByRole,
  buildExtensionExpiryMessage,
  buildEscalationMessage,
  buildVerifyResultMessage,
  buildEscalationActionCard,
  buildVerifyResultActionCard,
  buildRollbackActionCard,
  ESCALATION_LEVEL_NAMES,
} from './ar-collection-notify';

// 定时提醒任务
export { checkExtensionExpiryReminders } from './ar-collection-reminder.task';

// 预警查询服务
export {
  getUpcomingWarnings,
  getWarningReminders,
  hasReminderSentToday,
  recordWarningReminder,
} from './ar-warning.query';

// 预警提醒任务
export { checkUpcomingOverdueReminders } from './ar-warning.task';

// 预警消息模板
export { buildUpcomingWarningMessage } from './ar-collection-notify';
