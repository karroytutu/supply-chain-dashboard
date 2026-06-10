/**
 * OA - 通知处理函数
 * @module services/oa/oa-notify-handlers
 *
 * 通知通道说明：
 * - 待处理/转交/加签场景：仅创建钉钉流程中心待办（不再发送 ActionCard 工作通知）
 * - 通过/拒绝/撤回/抄送场景：发送 OA 消息工作通知（主动弹窗告知结果）
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('OA');

import { NotifyParams, getDingtalkUserIds, toDingtalkParams, saveTaskMapping } from './oa-notify';
import {
  buildResultOaMessage,
  buildCcOaMessage,
  sendResultNotification,
  sendCcNotification,
} from './oa-dingtalk';
import { createApprovalTodo } from './oa-process-centre';

/** 发送待处理通知（仅流程中心待办） */
export async function notifyPendingApproval(
  params: NotifyParams,
  approverIds: number[]
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName } = params;

  for (const approverId of approverIds) {
    try {
      await createApprovalTodo(
        instanceId,
        instanceNo,
        title,
        formTypeName,
        applicantName,
        approverId,
        params.formSchema,
        params.formData,
        params.nodeOrder,
        params.baseUrlOverride
      );
    } catch (error) {
      log.error('创建钉钉待办失败:', error);
    }
  }
}

/** 发送流程通过通知 */
export async function notifyApproved(params: NotifyParams, applicantId: number): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName } = params;

  const dingtalkUserIds = await getDingtalkUserIds([applicantId]);
  if (dingtalkUserIds.length > 0) {
    try {
      const oaMessage = buildResultOaMessage(toDingtalkParams(params), 'approved');
      const taskId = await sendResultNotification(
        dingtalkUserIds,
        oaMessage,
        instanceId,
        instanceNo
      );
      await saveTaskMapping(instanceId, taskId, [applicantId], 'approved');
    } catch (error) {
      log.error('Failed to send approved OA notification:', error);
    }
  }
}

/** 发送审批拒绝通知 */
export async function notifyRejected(
  params: NotifyParams,
  applicantId: number,
  reason: string,
  rejectUserName: string
): Promise<void> {
  const { instanceId, instanceNo } = params;

  const dingtalkUserIds = await getDingtalkUserIds([applicantId]);
  if (dingtalkUserIds.length > 0) {
    try {
      const rejectParams = { ...toDingtalkParams(params), reason, rejectUserName };
      const oaMessage = buildResultOaMessage(rejectParams, 'rejected');
      const taskId = await sendResultNotification(
        dingtalkUserIds,
        oaMessage,
        instanceId,
        instanceNo
      );
      await saveTaskMapping(instanceId, taskId, [applicantId], 'rejected');
    } catch (error) {
      log.error('Failed to send rejected OA notification:', error);
    }
  }
}

/** 发送转交通知（仅流程中心待办） */
export async function notifyTransferred(
  params: NotifyParams,
  newApproverId: number
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName } = params;

  // 为被转交人创建钉钉待办
  try {
    await createApprovalTodo(
      instanceId,
      instanceNo,
      title,
      formTypeName,
      applicantName,
      newApproverId,
      params.formSchema,
      params.formData,
      params.nodeOrder
    );
  } catch (error) {
    log.error('转交创建钉钉待办失败:', error);
  }
}

/** 发送加签通知（仅流程中心待办） */
export async function notifyCountersign(
  params: NotifyParams,
  countersignerIds: number[]
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName } = params;

  for (const countersignerId of countersignerIds) {
    try {
      await createApprovalTodo(
        instanceId,
        instanceNo,
        title,
        formTypeName,
        applicantName,
        countersignerId,
        params.formSchema,
        params.formData,
        params.nodeOrder
      );
    } catch (error) {
      log.error('加签创建钉钉待办失败:', error);
    }
  }
}

/** 发送撤回通知 */
export async function notifyWithdrawn(params: NotifyParams, approverIds: number[]): Promise<void> {
  const { instanceId, instanceNo } = params;

  const dingtalkUserIds = await getDingtalkUserIds(approverIds);
  if (dingtalkUserIds.length > 0) {
    try {
      const oaMessage = buildResultOaMessage(toDingtalkParams(params), 'withdrawn');
      const taskId = await sendResultNotification(
        dingtalkUserIds,
        oaMessage,
        instanceId,
        instanceNo
      );
      await saveTaskMapping(instanceId, taskId, approverIds, 'withdrawn');
    } catch (error) {
      log.error('Failed to send withdrawn OA notification:', error);
    }
  }
}

/** 发送抄送通知 */
export async function notifyCc(params: NotifyParams, ccUserIds: number[]): Promise<void> {
  const { instanceId, instanceNo } = params;

  const dingtalkUserIds = await getDingtalkUserIds(ccUserIds);
  if (dingtalkUserIds.length > 0) {
    try {
      const oaMessage = buildCcOaMessage(toDingtalkParams(params));
      const taskId = await sendCcNotification(dingtalkUserIds, oaMessage, instanceId, instanceNo);
      await saveTaskMapping(instanceId, taskId, ccUserIds, 'cc');
    } catch (error) {
      log.error('Failed to send CC OA notification:', error);
    }
  }
}
