/**
 * OA审批 - 拒绝 + 转交操作
 * @module services/oa-approval/mutations/reject-transfer
 */

import { appQuery as query } from '../../../db/appPool';
import {
  OaApprovalInstanceRow,
  OaApprovalNodeRow,
} from '../oa-approval.types';
import {
  isCurrentApprover,
  getCurrentApproverNode,
} from '../oa-approval-utils';
import { getFormTypeByCode } from '../form-types';
import { notifyRejected, notifyTransferred } from '../oa-approval-notify';
import { transaction, getInstanceNotifyData } from './shared-utils';

/**
 * 拒绝审批
 */
export async function rejectApproval(
  instanceId: number,
  userId: number,
  userName: string,
  comment: string
): Promise<void> {
  const canApprove = await isCurrentApprover(instanceId, userId);
  if (!canApprove) {
    throw new Error('您不是当前审批人，无法执行此操作');
  }

  await transaction(async (client) => {
    const currentNode = await getCurrentApproverNode(client, instanceId, userId);
    if (!currentNode) {
      throw new Error('未找到待审批节点');
    }

    await client.query(
      `UPDATE oa_approval_nodes SET status = 'rejected', comment = $1, acted_at = NOW() WHERE id = $2`,
      [comment, currentNode.id]
    );

    await client.query(
      `UPDATE oa_approval_instances SET status = 'rejected', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [instanceId]
    );

    await client.query(
      `UPDATE oa_approval_nodes SET status = 'cancelled'
       WHERE instance_id = $1 AND status = 'pending' AND id != $2`,
      [instanceId, currentNode.id]
    );

    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order, comment)
       VALUES ($1, 'reject', $2, $3, $4, $5)`,
      [instanceId, userId, userName, currentNode.node_order, comment]
    );

    // 触发审批驳回回调
    const instResult = await client.query<OaApprovalInstanceRow>(
      `SELECT * FROM oa_approval_instances WHERE id = $1`,
      [instanceId]
    );
    const ftCode = await client.query<{ code: string }>(
      `SELECT code FROM oa_form_types WHERE id = $1`,
      [instResult.rows[0].form_type_id]
    );
    const ft = ftCode.rows[0] ? getFormTypeByCode(ftCode.rows[0].code) : undefined;
    if (ft?.onRejected) {
      const rejectedInstance = instResult.rows[0];
      const rejectedFormData = rejectedInstance.form_data as Record<string, unknown>;
      queueMicrotask(() => {
        ft!.onRejected!(rejectedInstance, rejectedFormData)
          .catch(err => {
            console.error(`[OA] 审批驳回回调执行失败 [${ft!.code}]:`, err);
          });
      });
    }
  });

  setImmediate(() => {
    sendRejectNotification(instanceId, userId, userName, comment).catch(err => {
      console.error('[OA] 拒绝通知发送失败:', err);
    });
  });
}

/**
 * 转交审批
 */
export async function transferApproval(
  instanceId: number,
  userId: number,
  userName: string,
  transferToUserId: number,
  comment?: string
): Promise<void> {
  const canApprove = await isCurrentApprover(instanceId, userId);
  if (!canApprove) {
    throw new Error('您不是当前审批人，无法执行此操作');
  }

  const targetUserResult = await query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1`,
    [transferToUserId]
  );

  if (targetUserResult.rows.length === 0) {
    throw new Error('转交目标用户不存在');
  }

  const targetUserName = targetUserResult.rows[0].name;

  await transaction(async (client) => {
    const currentNode = await getCurrentApproverNode(client, instanceId, userId);
    if (!currentNode) {
      throw new Error('未找到待审批节点');
    }

    await client.query(
      `UPDATE oa_approval_nodes
       SET assigned_user_id = $1, assigned_user_name = $2,
           comment = $3, acted_at = NOW()
       WHERE id = $4`,
      [transferToUserId, targetUserName, `由 ${userName} 转交`, currentNode.id]
    );

    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order, comment, details)
       VALUES ($1, 'transfer', $2, $3, $4, $5, $6)`,
      [
        instanceId, userId, userName, currentNode.node_order,
        comment || null,
        JSON.stringify({ transferToUserId, transferToUserName: targetUserName }),
      ]
    );
  });

  setImmediate(() => {
    sendTransferNotification(instanceId, userId, userName, transferToUserId).catch(err => {
      console.error('[OA] 转交通知发送失败:', err);
    });
  });
}

/** 拒绝审批后发送通知 */
async function sendRejectNotification(
  instanceId: number,
  rejectUserId: number,
  rejectUserName: string,
  reason: string
): Promise<void> {
  const data = await getInstanceNotifyData(instanceId);
  if (!data) return;

  await notifyRejected(
    {
      instanceId,
      instanceNo: data.instance.instance_no,
      title: data.instance.title,
      formTypeName: data.formTypeName,
      applicantName: data.instance.applicant_name,
      reason,
      rejectUserName,
      formSchema: data.formType?.formSchema,
      formData: data.instance.form_data as Record<string, unknown>,
    },
    data.instance.applicant_id,
    reason,
    rejectUserName
  );
}

/** 转交审批后发送通知 */
async function sendTransferNotification(
  instanceId: number,
  fromUserId: number,
  fromUserName: string,
  transferToUserId: number
): Promise<void> {
  const data = await getInstanceNotifyData(instanceId);
  if (!data) return;

  const nodeResult = await query<{ node_name: string; node_order: number }>(
    `SELECT node_name, node_order FROM oa_approval_nodes
     WHERE instance_id = $1 AND assigned_user_id = $2 AND status = 'pending'
     ORDER BY node_order LIMIT 1`,
    [instanceId, transferToUserId]
  );

  await notifyTransferred(
    {
      instanceId,
      instanceNo: data.instance.instance_no,
      title: data.instance.title,
      formTypeName: data.formTypeName,
      applicantName: data.instance.applicant_name,
      fromUserName,
      nodeName: nodeResult.rows[0]?.node_name,
      nodeOrder: nodeResult.rows[0]?.node_order,
      formSchema: data.formType?.formSchema,
      formData: data.instance.form_data as Record<string, unknown>,
    },
    transferToUserId
  );
}
