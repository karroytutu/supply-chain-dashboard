/**
 * 共享通知服务
 * 提供用户解析和通知发送的通用能力
 */

export { getDingtalkUserIds, getDingtalkUserIdsByRole } from './user-resolver';
export { sendNotification, sendNotificationByRole } from './notification-sender';
export type { SendParams } from './notification-sender';
