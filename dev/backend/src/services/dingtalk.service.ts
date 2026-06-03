/**
 * 钉钉服务 - 统一导出入口
 * 实际实现已拆分到独立文件，此文件仅做 re-export 保持向后兼容
 * @module services/dingtalk.service
 */

// 类型定义
export type {
  DingtalkUserInfo,
  DingtalkUserDetail,
  MessageType,
  BusinessType,
  NotificationStatus,
  ActionCardButton,
  ActionCardContent,
  OaMessageFormRow,
  OaMessageContent,
  SendMessageOptions,
  SendResult,
  RetryConfig,
  NotificationLog,
  CreateNotificationLogParams,
} from './dingtalk-types';

// 常量
export { RETRYABLE_ERROR_CODES, DEFAULT_RETRY_CONFIG } from './dingtalk-types';

// 客户端与 Token
export { getAccessToken, sendDingtalkRequest, clearAccessTokenCache } from './dingtalk-client';

// 用户操作
export {
  getUserInfoByAuthCode,
  getUserInfoByCode,
  getUserDetail,
  getDepartmentInfo,
} from './dingtalk-user.service';

// 消息发送
export {
  sendWorkNotification,
} from './dingtalk-message.service';
