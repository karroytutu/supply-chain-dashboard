/**
 * OA审批 - 通知处理函数
 * @module services/oa-approval/oa-approval-notify-handlers
 */

import {
  NotifyParams,
  createInAppMessage,
  createInAppMessages,
  getDingtalkUserIds,
  buildUserIdToDingtalkIdMap,
  toDingtalkParams,
  saveTaskMapping,
  updateInstanceNotificationStatus,
} from './oa-approval-notify';
import {
  buildPendingActionCard,
  buildResultOaMessage,
  buildCcOaMessage,
  buildTransferActionCard,
  sendPendingNotification,
  sendResultNotification,
  sendCcNotification,
} from './oa-approval-dingtalk';
import { OA_DINGTALK_STATUS } from '../../utils/constants';

/** 发送待审批通知（ActionCard + 双按钮） */
export async function notifyPendingApproval(
  params: NotifyParams,
  approverIds: number[]
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName } = params;

  await createInAppMessages(
    approverIds.map((userId) => ({
      userId,
      type: 'approval_pending' as const,
      title: `待审批：${title}`,
      content: `${applicantName} 提交的 ${formTypeName} 需要您审批`,
      instanceId,
    }))
  );

  const dingtalkUserIds = await getDingtalkUserIds(approverIds);
  if (dingtalkUserIds.length === 0) return;

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

/** 发送审批通过通知 */
export async function notifyApproved(
  params: NotifyParams,
  applicantId: number
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName } = params;

  await createInAppMessage({
    userId: applicantId,
    type: 'result',
    title: `审批通过：${title}`,
    content: `您提交的 ${formTypeName} 已审批通过`,
    instanceId,
  });

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

  const statusConfig = OA_DINGTALK_STATUS.APPROVED;
  await updateInstanceNotificationStatus(instanceId, statusConfig.value, statusConfig.bg);
}

/** 发送审批拒绝通知 */
export async function notifyRejected(
  params: NotifyParams,
  applicantId: number,
  reason: string,
  rejectUserName: string
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName } = params;

  await createInAppMessage({
    userId: applicantId,
    type: 'result',
    title: `审批被拒绝：${title}`,
    content: `${rejectUserName} 拒绝了您提交的 ${formTypeName}。原因：${reason}`,
    instanceId,
  });

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

  const statusConfig = OA_DINGTALK_STATUS.REJECTED;
  await updateInstanceNotificationStatus(instanceId, statusConfig.value, statusConfig.bg);
}

/** 发送转交通知 */
export async function notifyTransferred(
  params: NotifyParams,
  newApproverId: number
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName, fromUserName } = params;

  await createInAppMessage({
    userId: newApproverId,
    type: 'approval_pending',
    title: `转交待审批：${title}`,
    content: `${fromUserName} 将 ${applicantName} 提交的 ${formTypeName} 转交给您审批`,
    instanceId,
  });

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

/** 发送加签通知 */
export async function notifyCountersign(
  params: NotifyParams,
  countersignerIds: number[]
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName, fromUserName } = params;

  await createInAppMessages(
    countersignerIds.map((userId) => ({
      userId,
      type: 'approval_pending' as const,
      title: `加签待审批：${title}`,
      content: `${fromUserName} 邀请您加签 ${applicantName} 提交的 ${formTypeName}`,
      instanceId,
    }))
  );

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

/** 发送撤回通知 */
export async function notifyWithdrawn(
  params: NotifyParams,
  approverIds: number[]
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName } = params;

  await createInAppMessages(
    approverIds.map((userId) => ({
      userId,
      type: 'result' as const,
      title: `审批已撤回：${title}`,
      content: `${applicantName} 撤回了提交的 ${formTypeName}`,
      instanceId,
    }))
  );

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

  const statusConfig = OA_DINGTALK_STATUS.WITHDRAWN;
  await updateInstanceNotificationStatus(instanceId, statusConfig.value, statusConfig.bg);
}

/** 发送抄送通知 */
export async function notifyCc(
  params: NotifyParams,
  ccUserIds: number[]
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName } = params;

  await createInAppMessages(
    ccUserIds.map((userId) => ({
      userId,
      type: 'cc' as const,
      title: `抄送：${title}`,
      content: `${applicantName} 提交的 ${formTypeName} 已抄送给您`,
      instanceId,
    }))
  );

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
