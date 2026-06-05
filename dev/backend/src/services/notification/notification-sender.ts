/**
 * 通知发送服务
 * 封装"解析用户 → 发送钉钉通知"的通用流程
 * @module services/notification/notification-sender
 */

import { sendWorkNotification, type SendMessageOptions } from '../dingtalk.service';
import { getDingtalkUserIds, getDingtalkUserIdsByRole } from './user-resolver';
import { createLogger } from '../../utils/logger';

const log = createLogger('Notification');

/** 通知发送参数 */
export interface SendParams {
  userIds: number[];
  title: string;
  content: string;
  options?: SendMessageOptions;
}

/**
 * 解析用户ID并发送钉钉通知
 * 失败仅记录日志，不抛出异常
 */
export async function sendNotification(params: SendParams): Promise<void> {
  try {
    const { userIds, title, content, options } = params;
    const dingtalkIds = await getDingtalkUserIds(userIds);
    if (dingtalkIds.length === 0) {
      log.info('无有效接收者，跳过通知:', title);
      return;
    }
    const result = await sendWorkNotification(dingtalkIds, title, content, options);
    log.info('通知发送结果:', title, result);
  } catch (error) {
    log.error('通知发送失败:', params.title, error);
  }
}

/**
 * 按角色发送钉钉通知
 * 失败仅记录日志，不抛出异常
 */
export async function sendNotificationByRole(
  roleCode: string,
  title: string,
  content: string,
  options?: SendMessageOptions
): Promise<void> {
  try {
    const dingtalkIds = await getDingtalkUserIdsByRole(roleCode);
    if (dingtalkIds.length === 0) {
      log.info('角色无有效用户，跳过通知:', roleCode, title);
      return;
    }
    const result = await sendWorkNotification(dingtalkIds, title, content, options);
    log.info('角色通知发送结果:', roleCode, result);
  } catch (error) {
    log.error('角色通知发送失败:', roleCode, title, error);
  }
}
