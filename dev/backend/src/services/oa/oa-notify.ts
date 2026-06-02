/**
 * OA通知服务 - 基础设施与统一导出入口
 * 通知处理函数已拆分到 oa-notify-handlers.ts
 * @module services/oa/oa-notify
 */

import { appQuery as query } from '../../db/appPool';
import { updateNotificationStatusBar } from '../dingtalk.service';
import type { CreateMessageParams, FormSchema } from './oa.types';

// Re-export notification handlers
export {
  notifyPendingApproval,
  notifyApproved,
  notifyRejected,
  notifyTransferred,
  notifyCountersign,
  notifyWithdrawn,
  notifyCc,
} from './oa-notify-handlers';

// =====================================================
// 通知参数类型
// =====================================================

export interface NotifyParams {
  instanceId: number;
  instanceNo: string;
  title: string;
  formTypeName: string;
  applicantName: string;
  nodeName?: string;
  nodeOrder?: number;
  reason?: string;
  fromUserName?: string;
  rejectUserName?: string;
  formSchema?: FormSchema;
  formData?: Record<string, unknown>;
}

// =====================================================
// 站内消息
// =====================================================

/** 创建站内消息 */
export async function createInAppMessage(params: CreateMessageParams): Promise<number> {
  const result = await query<{ id: number }>(
    `INSERT INTO oa_in_app_messages (user_id, type, title, content, instance_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [params.userId, params.type, params.title, params.content || null, params.instanceId || null]
  );
  return result.rows[0].id;
}

/** 批量创建站内消息 */
export async function createInAppMessages(messages: CreateMessageParams[]): Promise<void> {
  for (const msg of messages) {
    await createInAppMessage(msg);
  }
}

// =====================================================
// 辅助函数
// =====================================================

/** 获取用户的钉钉ID */
export async function getDingtalkUserIds(userIds: number[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const result = await query<{ dingtalk_user_id: string | null }>(
    `SELECT dingtalk_user_id FROM users WHERE id = ANY($1) AND dingtalk_user_id IS NOT NULL`,
    [userIds]
  );
  return result.rows.map(r => r.dingtalk_user_id).filter((id): id is string => !!id);
}

/** 构建 userId → dingtalk_user_id 映射表 */
export async function buildUserIdToDingtalkIdMap(userIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (userIds.length === 0) return map;
  const userRows = await query<{ id: number; dingtalk_user_id: string }>(
    `SELECT id, dingtalk_user_id FROM users WHERE id = ANY($1) AND dingtalk_user_id IS NOT NULL`,
    [userIds]
  );
  for (const row of userRows.rows) {
    map.set(row.id, row.dingtalk_user_id);
  }
  return map;
}

/** 构建 DingtalkNotifyParams */
export function toDingtalkParams(params: NotifyParams) {
  return {
    instanceId: params.instanceId,
    instanceNo: params.instanceNo,
    title: params.title,
    formTypeName: params.formTypeName,
    applicantName: params.applicantName,
    nodeName: params.nodeName,
    nodeOrder: params.nodeOrder,
    reason: params.reason,
    fromUserName: params.fromUserName,
    rejectUserName: params.rejectUserName,
    formSchema: params.formSchema,
    formData: params.formData,
  };
}

/** 保存通知TaskId映射 */
export async function saveTaskMapping(
  instanceId: number,
  taskId: number | undefined,
  receiverUserIds: number[],
  notificationType: string
): Promise<void> {
  if (!taskId) return;
  for (const userId of receiverUserIds) {
    await query(
      `INSERT INTO oa_notification_task_mapping (instance_id, task_id, receiver_user_id, notification_type)
       VALUES ($1, $2, $3, $4)`,
      [instanceId, taskId, userId, notificationType]
    );
  }
}

/** 更新审批实例所有通知的状态栏 */
export async function updateInstanceNotificationStatus(
  instanceId: number,
  statusValue: string,
  statusBg: string
): Promise<void> {
  const result = await query<{ task_id: string }>(
    `SELECT DISTINCT task_id FROM oa_notification_task_mapping
     WHERE instance_id = $1 AND notification_type = 'pending'`,
    [instanceId]
  );

  for (const row of result.rows) {
    const taskId = parseInt(row.task_id, 10);
    if (!isNaN(taskId)) {
      try {
        await updateNotificationStatusBar(taskId, statusValue, statusBg);
      } catch (error) {
        console.error(`[OA] 更新通知状态栏失败 (taskId=${taskId}):`, error);
      }
    }
  }
}
