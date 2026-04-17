/**
 * 钉钉服务模块入口
 * 统一导出所有钉钉相关功能
 */

// 核心服务
export {
  getAccessToken,
  getUserInfoByAuthCode,
  getUserInfoByCode,
  getUserDetail,
  getDepartmentInfo,
  clearAccessTokenCache,
  sendWorkNotification,
  getSendProgress,
  getSendResult,
  recallMessage,
  updateStatusBar,
} from './dingtalk.service';

// 类型导出
export type {
  DingtalkUserInfo,
  DingtalkUserDetail,
  SendMessageOptions,
  SendResult,
  SendProgress,
  SendResultResponse,
  ActionCardContent,
  OaContent,
  MessageType,
  BusinessType,
  NotificationStatus,
  NotificationLog,
  CreateNotificationLogParams,
  RetryConfig,
} from './dingtalk.types';

export {
  STATUS_BAR_COLORS,
  DEFAULT_RETRY_CONFIG,
  RETRYABLE_ERROR_CODES,
} from './dingtalk.types';

// 推送记录服务
export {
  createNotificationLog,
  updateNotificationLogStatus,
  getNotificationLogById,
  getNotificationLogByTaskId,
  getPendingRetryLogs,
  getRecentNotificationLog,
  getNotificationStats,
} from './notification-log.service';

// 重试处理
export {
  handleRetry,
  calculateNextRetry,
  isRetryableError,
  initializeRetryTimes,
} from './retry.handler';

// 消息构建器
export { ActionCardBuilder, createSimpleActionCard } from './builders/action-card.builder';
export { OaBuilder, createSimpleOa } from './builders/oa.builder';

// 催收通知模板
export { buildExtensionExpiryMessage } from './templates/collection/extension-expiry';
export { buildEscalationMessage } from './templates/collection/escalation';
export { buildMergedWarningMessage, type WarningDebtItem } from './templates/collection/warning';
export { buildVerifyResultMessage } from './templates/collection/verify-result';

// 退货单通知模板
export {
  buildDailyNewReturnMessage,
  buildPendingErpMessage,
  buildCannotPurchaseReturnMessage,
  buildPendingWarehouseExecuteMessage,
} from './templates/return-order/daily-reminder';

// 退货考核通知模板
export {
  buildPenaltyNoticeMessage,
  buildBatchPenaltyNoticeMessages,
} from './templates/return-penalty/penalty-notice';
