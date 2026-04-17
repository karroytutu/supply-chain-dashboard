/**
 * OA审批通知服务
 * @module services/oa-approval/oa-approval-notify
 */

import { appQuery as query } from '../../db/appPool';
import { sendWorkNotification } from '../dingtalk.service';
import {
  CreateMessageParams,
  OaApprovalInstanceRow,
  OaFormTypeRow,
} from './oa-approval.types';

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
// 钉钉通知
// =====================================================

interface NotifyParams {
  instanceId: number;
  instanceNo: string;
  title: string;
  formTypeName: string;
  applicantName: string;
  urgency?: string;
  nodeName?: string;
  reason?: string;
  fromUserName?: string;
}

/**
 * 获取用户的钉钉ID
 */
async function getDingtalkUserIds(userIds: number[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const result = await query<{ dingtalk_userid: string | null }>(
    `SELECT dingtalk_userid FROM users WHERE id = ANY($1) AND dingtalk_userid IS NOT NULL`,
    [userIds]
  );
  return result.rows.map(r => r.dingtalk_userid).filter((id): id is string => !!id);
}

/**
 * 发送待审批通知
 */
export async function notifyPendingApproval(
  params: NotifyParams,
  approverIds: number[]
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName, urgency, nodeName } = params;

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

  // 钉钉通知
  const urgencyText = urgency === 'urgent' ? '【非常紧急】' : urgency === 'high' ? '【紧急】' : '';
  const dingtalkUserIds = await getDingtalkUserIds(approverIds);

  if (dingtalkUserIds.length > 0) {
    const markdown = `## ${urgencyText}待审批通知

**标题**: ${title}
**编号**: ${instanceNo}
**类型**: ${formTypeName}
**申请人**: ${applicantName}
**当前节点**: ${nodeName || '-'}
**紧急程度**: ${urgency === 'urgent' ? '非常紧急' : urgency === 'high' ? '紧急' : '普通'}

请尽快处理审批。`;

    try {
      await sendWorkNotification(dingtalkUserIds, '待审批通知', markdown);
    } catch (error) {
      console.error('Failed to send DingTalk notification:', error);
    }
  }
}

/**
 * 发送审批通过通知（给申请人）
 */
export async function notifyApproved(
  params: NotifyParams,
  applicantId: number
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName } = params;

  // 站内消息
  await createInAppMessage({
    userId: applicantId,
    type: 'result',
    title: `审批通过：${title}`,
    content: `您提交的 ${formTypeName} 已审批通过`,
    instanceId,
  });

  // 钉钉通知
  const dingtalkUserIds = await getDingtalkUserIds([applicantId]);

  if (dingtalkUserIds.length > 0) {
    const markdown = `## 审批通过通知

**标题**: ${title}
**编号**: ${instanceNo}
**类型**: ${formTypeName}

您的审批申请已通过。`;

    try {
      await sendWorkNotification(dingtalkUserIds, '审批通过通知', markdown);
    } catch (error) {
      console.error('Failed to send DingTalk notification:', error);
    }
  }
}

/**
 * 发送审批拒绝通知（给申请人）
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

  // 钉钉通知
  const dingtalkUserIds = await getDingtalkUserIds([applicantId]);

  if (dingtalkUserIds.length > 0) {
    const markdown = `## 审批被拒绝通知

**标题**: ${title}
**编号**: ${instanceNo}
**类型**: ${formTypeName}
**拒绝人**: ${rejectUserName}
**拒绝原因**: ${reason}

您的审批申请已被拒绝。`;

    try {
      await sendWorkNotification(dingtalkUserIds, '审批被拒绝通知', markdown);
    } catch (error) {
      console.error('Failed to send DingTalk notification:', error);
    }
  }
}

/**
 * 发送转交通知（给新审批人）
 */
export async function notifyTransferred(
  params: NotifyParams,
  newApproverId: number
): Promise<void> {
  const { instanceId, instanceNo, title, formTypeName, applicantName, fromUserName, nodeName } = params;

  // 站内消息
  await createInAppMessage({
    userId: newApproverId,
    type: 'approval_pending',
    title: `转交待审批：${title}`,
    content: `${fromUserName} 将 ${applicantName} 提交的 ${formTypeName} 转交给您审批`,
    instanceId,
  });

  // 钉钉通知
  const dingtalkUserIds = await getDingtalkUserIds([newApproverId]);

  if (dingtalkUserIds.length > 0) {
    const markdown = `## 转交待审批通知

**标题**: ${title}
**编号**: ${instanceNo}
**类型**: ${formTypeName}
**原申请人**: ${applicantName}
**转交人**: ${fromUserName}
**当前节点**: ${nodeName || '-'}

此审批已转交给您处理。`;

    try {
      await sendWorkNotification(dingtalkUserIds, '转交待审批通知', markdown);
    } catch (error) {
      console.error('Failed to send DingTalk notification:', error);
    }
  }
}

/**
 * 发送加签通知（给加签人）
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

  // 钉钉通知
  const dingtalkUserIds = await getDingtalkUserIds(countersignerIds);

  if (dingtalkUserIds.length > 0) {
    const markdown = `## 加签待审批通知

**标题**: ${title}
**编号**: ${instanceNo}
**类型**: ${formTypeName}
**申请人**: ${applicantName}
**加签发起人**: ${fromUserName}

您被邀请参与此审批的加签流程。`;

    try {
      await sendWorkNotification(dingtalkUserIds, '加签待审批通知', markdown);
    } catch (error) {
      console.error('Failed to send DingTalk notification:', error);
    }
  }
}

/**
 * 发送撤回通知（给原审批人）
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

  // 钉钉通知
  const dingtalkUserIds = await getDingtalkUserIds(approverIds);

  if (dingtalkUserIds.length > 0) {
    const markdown = `## 审批已撤回通知

**标题**: ${title}
**编号**: ${instanceNo}
**类型**: ${formTypeName}
**撤回人**: ${applicantName}

此审批已被申请人撤回。`;

    try {
      await sendWorkNotification(dingtalkUserIds, '审批已撤回通知', markdown);
    } catch (error) {
      console.error('Failed to send DingTalk notification:', error);
    }
  }
}

/**
 * 发送抄送通知
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

  // 钉钉通知
  const dingtalkUserIds = await getDingtalkUserIds(ccUserIds);

  if (dingtalkUserIds.length > 0) {
    const markdown = `## 抄送通知

**标题**: ${title}
**编号**: ${instanceNo}
**类型**: ${formTypeName}
**申请人**: ${applicantName}

此审批已抄送给您。`;

    try {
      await sendWorkNotification(dingtalkUserIds, '抄送通知', markdown);
    } catch (error) {
      console.error('Failed to send DingTalk notification:', error);
    }
  }
}
