/**
 * 钉钉工作通知推送记录服务
 * 管理推送记录的创建、更新、查询
 */

import { appQuery } from '../db/appPool';
import {
  type NotificationLog,
  type CreateNotificationLogParams,
  type NotificationStatus,
  type BusinessType,
  type MessageType,
  DEFAULT_RETRY_CONFIG,
} from './dingtalk.service';

/**
 * 创建推送记录
 */
export async function createNotificationLog(params: CreateNotificationLogParams): Promise<number> {
  const {
    businessType,
    businessId,
    businessNo,
    msgType,
    title,
    content,
    taskId,
    receiverIds,
    createdBy,
  } = params;

  const result = await appQuery<{ id: number }>(
    `INSERT INTO dingtalk_notification_logs (
      business_type, business_id, business_no, msg_type, title, content,
      task_id, receiver_ids, status, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
    RETURNING id`,
    [
      businessType,
      businessId || null,
      businessNo || null,
      msgType,
      title,
      content || null,
      taskId || null,
      receiverIds,
      createdBy || null,
    ]
  );

  return result.rows[0].id;
}

/**
 * 更新推送记录状态
 */
export async function updateNotificationLogStatus(
  id?: number,
  status?: NotificationStatus,
  taskId?: number,
  errorMessage?: string,
  retryCount?: number,
  nextRetryAt?: Date
): Promise<void> {
  // 如果有 taskId 但没有 id，先通过 taskId 查找
  if (!id && taskId) {
    const log = await getNotificationLogByTaskId(taskId);
    if (log) {
      id = log.id;
    }
  }

  if (!id) {
    console.warn('[NotificationLog] 更新失败：缺少记录ID');
    return;
  }

  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [];
  let paramIndex = 1;

  if (status) {
    updates.push(`status = $${paramIndex++}`);
    values.push(status);
    if (status === 'sent') {
      updates.push('sent_at = CURRENT_TIMESTAMP');
    }
  }

  if (taskId !== undefined) {
    updates.push(`task_id = $${paramIndex++}`);
    values.push(taskId);
  }

  if (errorMessage !== undefined) {
    updates.push(`error_message = $${paramIndex++}`);
    values.push(errorMessage);
  }

  if (retryCount !== undefined) {
    updates.push(`retry_count = $${paramIndex++}`);
    values.push(retryCount);
  }

  if (nextRetryAt !== undefined) {
    updates.push(`next_retry_at = $${paramIndex++}`);
    values.push(nextRetryAt);
  }

  values.push(id);

  await appQuery(
    `UPDATE dingtalk_notification_logs SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
}

/**
 * 根据ID获取推送记录
 */
export async function getNotificationLogById(id: number): Promise<NotificationLog | null> {
  const result = await appQuery(
    `SELECT 
      id,
      business_type as "businessType",
      business_id as "businessId",
      business_no as "businessNo",
      msg_type as "msgType",
      title,
      content,
      task_id as "taskId",
      receiver_ids as "receiverIds",
      status,
      error_message as "errorMessage",
      retry_count as "retryCount",
      max_retry as "maxRetry",
      next_retry_at as "nextRetryAt",
      created_by as "createdBy",
      created_at as "createdAt",
      sent_at as "sentAt",
      updated_at as "updatedAt"
    FROM dingtalk_notification_logs
    WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToNotificationLog(result.rows[0]);
}

/**
 * 根据 taskId 获取推送记录
 */
export async function getNotificationLogByTaskId(taskId: number): Promise<NotificationLog | null> {
  const result = await appQuery(
    `SELECT 
      id,
      business_type as "businessType",
      business_id as "businessId",
      business_no as "businessNo",
      msg_type as "msgType",
      title,
      content,
      task_id as "taskId",
      receiver_ids as "receiverIds",
      status,
      error_message as "errorMessage",
      retry_count as "retryCount",
      max_retry as "maxRetry",
      next_retry_at as "nextRetryAt",
      created_by as "createdBy",
      created_at as "createdAt",
      sent_at as "sentAt",
      updated_at as "updatedAt"
    FROM dingtalk_notification_logs
    WHERE task_id = $1`,
    [taskId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToNotificationLog(result.rows[0]);
}

/**
 * 获取待重试的推送记录
 */
export async function getPendingRetryLogs(): Promise<NotificationLog[]> {
  const result = await appQuery(
    `SELECT 
      id,
      business_type as "businessType",
      business_id as "businessId",
      business_no as "businessNo",
      msg_type as "msgType",
      title,
      content,
      task_id as "taskId",
      receiver_ids as "receiverIds",
      status,
      error_message as "errorMessage",
      retry_count as "retryCount",
      max_retry as "maxRetry",
      next_retry_at as "nextRetryAt",
      created_by as "createdBy",
      created_at as "createdAt",
      sent_at as "sentAt",
      updated_at as "updatedAt"
    FROM dingtalk_notification_logs
    WHERE status = 'failed'
      AND retry_count < max_retry
      AND next_retry_at IS NOT NULL
      AND next_retry_at <= CURRENT_TIMESTAMP
    ORDER BY next_retry_at ASC
    LIMIT 100`,
    []
  );

  return result.rows.map(mapRowToNotificationLog);
}

/**
 * 映射数据库行到 NotificationLog 对象
 */
function mapRowToNotificationLog(row: any): NotificationLog {
  return {
    id: row.id,
    businessType: row.businessType as BusinessType,
    businessId: row.businessId,
    businessNo: row.businessNo,
    msgType: row.msgType as MessageType,
    title: row.title,
    content: row.content,
    taskId: row.taskId,
    receiverIds: row.receiverIds || [],
    status: row.status as NotificationStatus,
    errorMessage: row.errorMessage,
    retryCount: row.retryCount || 0,
    maxRetry: row.maxRetry || DEFAULT_RETRY_CONFIG.maxRetries,
    nextRetryAt: row.nextRetryAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
    updatedAt: row.updatedAt,
  };
}
