/**
 * OA - 加签 + 撤回操作
 * @module services/oa/mutations/countersign-withdraw
 */
import { createLogger } from '../../../utils/logger';
const log = createLogger('OA');

import { appQuery as query } from '../../../db/appPool';
import { OaInstanceRow, OaNodeRow } from '../oa.types';
import { isCurrentApprover, isApplicant, getCurrentApproverNode } from '../oa-utils';
import { notifyCountersign, notifyWithdrawn } from '../oa-notify';
import { completeAllPendingTodos } from '../oa-process-centre';
import { transaction, getInstanceNotifyData, insertNodeAfter } from './shared-utils';

/**
 * 加签审批
 * 重构后使用通用的 insertNodeAfter 函数实现节点插入
 */
export async function countersignApproval(
  instanceId: number,
  userId: number,
  userName: string,
  countersignType: 'before' | 'after',
  countersignUserIds: number[],
  comment?: string
): Promise<void> {
  const canApprove = await isCurrentApprover(instanceId, userId);
  if (!canApprove) {
    throw new Error('您不是当前审批人，无法执行此操作');
  }

  if (countersignUserIds.length === 0) {
    throw new Error('请选择至少一个加签人');
  }

  const countersignUsersResult = await query<{ id: number; name: string }>(
    `SELECT id, name FROM users WHERE id = ANY($1)`,
    [countersignUserIds]
  );

  const countersignUsers = countersignUsersResult.rows;

  await transaction(async client => {
    const currentNode = await getCurrentApproverNode(client, instanceId, userId);
    if (!currentNode) {
      throw new Error('未找到待审批节点');
    }

    // 确定插入位置：前加签在当前节点之前，后加签在当前节点之后
    const insertAfterOrder = countersignType === 'before'
      ? currentNode.node_order - 1
      : currentNode.node_order;

    // 使用通用的 insertNodeAfter 函数逐个插入加签节点
    // 后加签时每次递增 insertAfterOrder，确保节点顺序与 countersignUsers 数组一致
    let currentInsertAfter = insertAfterOrder;
    for (const csUser of countersignUsers) {
      const insertedNode = await insertNodeAfter(client, instanceId, currentInsertAfter, {
        name: '加签',
        type: 'countersign',
        assignedUserId: csUser.id,
        assignedUserName: csUser.name,
      });

      // 使用 insertNodeAfter 返回的 id 精确定位新插入的节点（避免 PG 不支持的 ORDER BY LIMIT）
      await client.query(
        `UPDATE oa_approval_nodes
         SET is_countersign = true, countersign_parent_node_id = $1
         WHERE id = $2`,
        [currentNode.id, insertedNode.id]
      );

      // 后加签时递增插入位置，保证顺序正确
      if (countersignType === 'after') {
        currentInsertAfter++;
      }
    }

    // 前加签时需要更新当前节点顺序（因为 insertNodeAfter 会在 insertAfterOrder 之后插入）
    if (countersignType === 'before') {
      await client.query(
        `UPDATE oa_approval_instances SET current_node_order = current_node_order + $1, updated_at = NOW() WHERE id = $2`,
        [countersignUsers.length, instanceId]
      );
    }

    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order, comment, details)
       VALUES ($1, 'countersign', $2, $3, $4, $5, $6)`,
      [
        instanceId,
        userId,
        userName,
        currentNode.node_order,
        null,
        JSON.stringify({
          countersignType,
          countersignUserIds,
          countersignUserNames: countersignUsers.map(u => u.name),
        }),
      ]
    );

    // 如果用户填写了加签备注，作为独立 comment 记录插入（统一评论模型）
    if (comment && comment.trim()) {
      await client.query(
        `INSERT INTO oa_approval_actions
          (instance_id, action_type, operator_id, operator_name, node_order, comment)
         VALUES ($1, 'comment', $2, $3, $4, $5)`,
        [instanceId, userId, userName, currentNode.node_order, comment.trim()]
      );
    }
  });

  setImmediate(() => {
    sendCountersignNotification(instanceId, userId, userName, countersignUserIds).catch(err => {
      log.error('加签通知发送失败:', err);
    });
  });
}

/**
 * 撤回审批
 */
export async function withdrawApproval(
  instanceId: number,
  userId: number,
  userName: string
): Promise<void> {
  const isOwner = await isApplicant(instanceId, userId);
  if (!isOwner) {
    throw new Error('只有申请人可以撤回审批');
  }

  const instanceResult = await query<OaInstanceRow>(
    `SELECT * FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );

  if (instanceResult.rows.length === 0) {
    throw new Error('审批实例不存在');
  }

  const instance = instanceResult.rows[0];

  if (instance.status !== 'pending') {
    throw new Error('只有审批中的申请可以撤回');
  }

  await transaction(async client => {
    await client.query(
      `UPDATE oa_approval_instances SET status = 'withdrawn', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [instanceId]
    );

    await client.query(
      `UPDATE oa_approval_nodes SET status = 'cancelled' WHERE instance_id = $1 AND status = 'pending'`,
      [instanceId]
    );

    await client.query(
      `INSERT INTO oa_approval_actions (instance_id, action_type, operator_id, operator_name)
       VALUES ($1, 'withdraw', $2, $3)`,
      [instanceId, userId, userName]
    );
  });

  setImmediate(() => {
    // 新增：取消所有被取消节点审批人的钉钉待办 + 完成壳实例
    completeAllPendingTodos(instanceId, 'refuse').catch(err => {
      log.error('批量取消钉钉待办失败:', err);
    });
    sendWithdrawNotification(instanceId, userId, userName).catch(err => {
      log.error('撤回通知发送失败:', err);
    });
  });
}

/** 加签审批后发送通知 */
async function sendCountersignNotification(
  instanceId: number,
  fromUserId: number,
  fromUserName: string,
  countersignUserIds: number[]
): Promise<void> {
  const data = await getInstanceNotifyData(instanceId);
  if (!data) return;

  await notifyCountersign(
    {
      instanceId,
      instanceNo: data.instance.instance_no,
      title: data.instance.title,
      formTypeName: data.formTypeName,
      applicantName: data.instance.applicant_name,
      fromUserName,
      formSchema: data.formType?.formSchema,
      formData: data.instance.form_data as Record<string, unknown>,
    },
    countersignUserIds
  );
}

/** 撤回审批后发送通知 */
async function sendWithdrawNotification(
  instanceId: number,
  applicantId: number,
  applicantName: string
): Promise<void> {
  const data = await getInstanceNotifyData(instanceId);
  if (!data) return;

  const nodeResult = await query<{ assigned_user_id: number }>(
    `SELECT DISTINCT assigned_user_id FROM oa_approval_nodes
     WHERE instance_id = $1 AND status = 'cancelled' AND assigned_user_id IS NOT NULL`,
    [instanceId]
  );
  const approverIds = nodeResult.rows.map(r => r.assigned_user_id);

  if (approverIds.length > 0) {
    await notifyWithdrawn(
      {
        instanceId,
        instanceNo: data.instance.instance_no,
        title: data.instance.title,
        formTypeName: data.formTypeName,
        applicantName,
        formSchema: data.formType?.formSchema,
        formData: data.instance.form_data as Record<string, unknown>,
      },
      approverIds
    );
  }
}
