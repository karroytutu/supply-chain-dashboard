/**
 * OA审批通知服务
 * 待审批通知使用 ActionCard（含"同意"+"查看详情"双按钮）
 * 结果/抄送通知使用 OA消息（带状态栏颜色反馈）
 * 审批状态变更后自动更新钉钉通知状态栏
 * @module services/oa-approval/oa-approval-notify
 */

import { appQuery as query } from '../../db/appPool';
import { updateNotificationStatusBar } from '../dingtalk.service';
import {
  CreateMessageParams,
  FormSchema,
} from './oa-approval.types';
import {
  DingtalkNotifyParams,
  buildPendingActionCard,
  buildResultOaMessage,
  buildCcOaMessage,
  buildTransferActionCard,
  sendPendingNotification,
  sendResultNotification,
  sendCcNotification,
} from './oa-approval-dingtalk';
import { OA_DINGTALK_STATUS } from '../../utils/constants';

// =====================================================
// 站内消息
// =====================================================

/**
 * 创建站内消息
 */
export async function createInAppMessage(params: CreateMessageParams): Promise<number> {
  const result = await query<{ id: number }>(
    `INSERT INTO oa_in_app_messages (user_id, type, title, content, instance_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [params.userId, params.type, params.title, params.content || null, params.instanceId || null]
  );
  return result.rows[0].id;
}

/**
 * 批量创建站内消息
 */
export async function createInAppMessages(
  messages: CreateMessageParams[]
): Promise<void> {
  for (const msg of messages) {
    await createInAppMessage(msg);
  }
}

// =====================================================
// 通知参数类型
// =====================================================

interface NotifyParams {
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
// 辅助函数
// =====================================================

/**
 * 获取用户的钉钉ID
 */
async function getDingtalkUserIds(userIds: number[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const result = await query<{ dingtalk_user_id: string | null }>(
    `SELECT dingtalk_user_id FROM users WHERE id = ANY($1) AND dingtalk_user_id IS NOT NULL`,
    [userIds]
  );
  return result.rows.map(r => r.dingtalk_user_id).filter((id): id is string => !!id);
}

/**
 * 构建 userId → dingtalk_user_id 映射表
 * 用于 ActionCard 通知时为每个用户生成独立 Token
 */
async function buildUserIdToDingtalkIdMap(userIds: number[]): Promise<Map<number, string>> {
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

/**
 * 构建 DingtalkNotifyParams
 */
function toDingtalkParams(params: NotifyParams): DingtalkNotifyParams {
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

/**
 * 保存通知TaskId映射（用于后续状态栏更新）
 */
async function saveTaskMapping(
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

/**
 * 更新审批实例所有通知的状态栏
 * 查询该实例所有pending类型的taskId，批量调用状态栏更新API
 */
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

// =====================================================
// 通知发送函数
// =====================================================

/**
 * 发送待审批通知（ActionCard + 双按钮）
 */
export async function notifyPendingApproval(
  params: NotifyParams,
  approverIds: number[]
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName } = params;

  // 站内消息
  await createInAppMessages(
    approverIds.map((userId) => ({
      userId,
      type: 'approval_pending' as const,
      title: `待审批：${title}`,
      content: `${applicantName} 提交的 ${formTypeName} 需要您审批`,
      instanceId,
    }))
  );

  // 钉钉ActionCard通知
  const dingtalkUserIds = await getDingtalkUserIds(approverIds);
  if (dingtalkUserIds.length === 0) return;

  // 为每个审批人单独构建ActionCard（每个用户有独立的Token）
  const userIdToDingtalkId = await buildUserIdToDingtalkIdMap(approverIds);

  for (const approverId of approverIds) {
    const dingtalkId = userIdToDingtalkId.get(approverId);
    if (!dingtalkId) continue;

    try {
      const actionCard = await buildPendingActionCard(toDingtalkParams(params), approverId);
      const taskId = await sendPendingNotification([dingtalkId], actionCard, instanceId, instanceNo);
      await saveTaskMapping(instanceId, taskId, [approverId], 'pending');
    } catch (error) {
      console.error('Failed to send pending ActionCard notification:', error);
    }
  }
}

/**
 * 发送审批通过通知（OA消息 + 更新状态栏）
 */
export async function notifyApproved(
  params: NotifyParams,
  applicantId: number
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName } = params;

  // 站内消息
  await createInAppMessage({
    userId: applicantId,
    type: 'result',
    title: `审批通过：${title}`,
    content: `您提交的 ${formTypeName} 已审批通过`,
    instanceId,
  });

  // 钉钉OA结果通知
  const dingtalkUserIds = await getDingtalkUserIds([applicantId]);
  if (dingtalkUserIds.length > 0) {
    try {
      const oaMessage = buildResultOaMessage(toDingtalkParams(params), 'approved');
      const taskId = await sendResultNotification(dingtalkUserIds, oaMessage, instanceId, instanceNo);
      await saveTaskMapping(instanceId, taskId, [applicantId], 'approved');
    } catch (error) {
      console.error('Failed to send approved OA notification:', error);
    }
  }

  // 更新该实例所有pending通知的状态栏为"已通过"
  const statusConfig = OA_DINGTALK_STATUS.APPROVED;
  await updateInstanceNotificationStatus(instanceId, statusConfig.value, statusConfig.bg);
}

/**
 * 发送审批拒绝通知（OA消息 + 更新状态栏）
 */
export async function notifyRejected(
  params: NotifyParams,
  applicantId: number,
  reason: string,
  rejectUserName: string
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName } = params;

  // 站内消息
  await createInAppMessage({
    userId: applicantId,
    type: 'result',
    title: `审批被拒绝：${title}`,
    content: `${rejectUserName} 拒绝了您提交的 ${formTypeName}。原因：${reason}`,
    instanceId,
  });

  // 钉钉OA结果通知
  const dingtalkUserIds = await getDingtalkUserIds([applicantId]);
  if (dingtalkUserIds.length > 0) {
    try {
      const rejectParams = { ...toDingtalkParams(params), reason, rejectUserName };
      const oaMessage = buildResultOaMessage(rejectParams, 'rejected');
      const taskId = await sendResultNotification(dingtalkUserIds, oaMessage, instanceId, instanceNo);
      await saveTaskMapping(instanceId, taskId, [applicantId], 'rejected');
    } catch (error) {
      console.error('Failed to send rejected OA notification:', error);
    }
  }

  // 更新该实例所有pending通知的状态栏为"已拒绝"
  const statusConfig = OA_DINGTALK_STATUS.REJECTED;
  await updateInstanceNotificationStatus(instanceId, statusConfig.value, statusConfig.bg);
}

/**
 * 发送转交通知（ActionCard + 更新原通知状态栏）
 */
export async function notifyTransferred(
  params: NotifyParams,
  newApproverId: number
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName, fromUserName } = params;

  // 站内消息
  await createInAppMessage({
    userId: newApproverId,
    type: 'approval_pending',
    title: `转交待审批：${title}`,
    content: `${fromUserName} 将 ${applicantName} 提交的 ${formTypeName} 转交给您审批`,
    instanceId,
  });

  // 钉钉ActionCard通知
  const dingtalkUserIds = await getDingtalkUserIds([newApproverId]);
  if (dingtalkUserIds.length > 0) {
    try {
      const actionCard = await buildTransferActionCard(toDingtalkParams(params), newApproverId);
      const taskId = await sendPendingNotification(dingtalkUserIds, actionCard, instanceId, instanceNo);
      await saveTaskMapping(instanceId, taskId, [newApproverId], 'pending');
    } catch (error) {
      console.error('Failed to send transfer ActionCard notification:', error);
    }
  }
}

/**
 * 发送加签通知（ActionCard）
 */
export async function notifyCountersign(
  params: NotifyParams,
  countersignerIds: number[]
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName, fromUserName } = params;

  // 站内消息
  await createInAppMessages(
    countersignerIds.map((userId) => ({
      userId,
      type: 'approval_pending' as const,
      title: `加签待审批：${title}`,
      content: `${fromUserName} 邀请您加签 ${applicantName} 提交的 ${formTypeName}`,
      instanceId,
    }))
  );

  // 钉钉ActionCard通知（为每个加签人单独构建，含独立Token）
  const userIdToDingtalkId = await buildUserIdToDingtalkIdMap(countersignerIds);

  for (const countersignerId of countersignerIds) {
    const dingtalkId = userIdToDingtalkId.get(countersignerId);
    if (!dingtalkId) continue;

    try {
      const actionCard = await buildPendingActionCard(toDingtalkParams(params), countersignerId);
      const taskId = await sendPendingNotification([dingtalkId], actionCard, instanceId, instanceNo);
      await saveTaskMapping(instanceId, taskId, [countersignerId], 'pending');
    } catch (error) {
      console.error('Failed to send countersign ActionCard notification:', error);
    }
  }
}

/**
 * 发送撤回通知（OA消息 + 更新状态栏）
 */
export async function notifyWithdrawn(
  params: NotifyParams,
  approverIds: number[]
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName } = params;

  // 站内消息
  await createInAppMessages(
    approverIds.map((userId) => ({
      userId,
      type: 'result' as const,
      title: `审批已撤回：${title}`,
      content: `${applicantName} 撤回了提交的 ${formTypeName}`,
      instanceId,
    }))
  );

  // 钉钉OA结果通知
  const dingtalkUserIds = await getDingtalkUserIds(approverIds);
  if (dingtalkUserIds.length > 0) {
    try {
      const oaMessage = buildResultOaMessage(toDingtalkParams(params), 'withdrawn');
      const taskId = await sendResultNotification(dingtalkUserIds, oaMessage, instanceId, instanceNo);
      await saveTaskMapping(instanceId, taskId, approverIds, 'withdrawn');
    } catch (error) {
      console.error('Failed to send withdrawn OA notification:', error);
    }
  }

  // 更新该实例所有pending通知的状态栏为"已撤回"
  const statusConfig = OA_DINGTALK_STATUS.WITHDRAWN;
  await updateInstanceNotificationStatus(instanceId, statusConfig.value, statusConfig.bg);
}

/**
 * 发送抄送通知（OA消息）
 */
export async function notifyCc(
  params: NotifyParams,
  ccUserIds: number[]
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName } = params;

  // 站内消息
  await createInAppMessages(
    ccUserIds.map((userId) => ({
      userId,
      type: 'cc' as const,
      title: `抄送：${title}`,
      content: `${applicantName} 提交的 ${formTypeName} 已抄送给您`,
      instanceId,
    }))
  );

  // 钉钉OA抄送通知
  const dingtalkUserIds = await getDingtalkUserIds(ccUserIds);
  if (dingtalkUserIds.length > 0) {
    try {
      const oaMessage = buildCcOaMessage(toDingtalkParams(params));
      const taskId = await sendCcNotification(dingtalkUserIds, oaMessage, instanceId, instanceNo);
      await saveTaskMapping(instanceId, taskId, ccUserIds, 'cc');
    } catch (error) {
      console.error('Failed to send CC OA notification:', error);
    }
  }
}
