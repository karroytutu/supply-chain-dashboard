/**
 * OA - 加签 + 撤回操作
 * @module services/oa/mutations/countersign-withdraw
 */
import { createLogger } from '../../../utils/logger';
const log = createLogger('OA');

import { appQuery as query } from '../../../db/appPool';
import { OaInstanceRow, OaNodeRow } from '../oa.types';
import { isCurrentApprover, isApplicant, getCurrentApproverNode } from '../oa-utils';
import {
  enqueueCompleteAllPendingTodos,
  enqueueSendApprovalNotification,
} from '../oa-async-task.service';
import { transaction, insertNodeAfter } from './shared-utils';

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
    // 实例级分布式锁 + 行锁，防止多实例并发状态覆盖
    await client.query('SELECT pg_advisory_xact_lock($1)', [instanceId]);

    const instanceResult = await client.query<OaInstanceRow>(
      `SELECT * FROM oa_approval_instances WHERE id = $1 FOR UPDATE`,
      [instanceId]
    );
    if (instanceResult.rows.length === 0) {
      throw new Error('审批实例不存在');
    }
    if (instanceResult.rows[0].status !== 'pending') {
      throw new Error('审批实例不在处理中，无法加签');
    }

    const currentNode = await getCurrentApproverNode(client, instanceId, userId);
    if (!currentNode) {
      throw new Error('未找到待审批节点');
    }

    // 确定插入位置：前加签在当前节点之前，后加签在当前节点之后
    const insertAfterOrder = countersignType === 'before'
      ? currentNode.node_order - 1
      : currentNode.node_order;

    // 使用通用的 insertNodeAfter 函数逐个插入加签节点
    // 前/后加签均每次递增 insertAfterOrder，确保节点顺序与 countersignUsers 数组一致
    let currentInsertAfter = insertAfterOrder;
    for (const csUser of countersignUsers) {
      const insertedNode = await insertNodeAfter(client, instanceId, currentInsertAfter, {
        name: '加签',
        type: 'approval',
        assignedUserIds: [csUser.id],
        timeout: currentNode.timeout_config || undefined,
      });

      // 使用 insertNodeAfter 返回的 id 精确定位新插入的节点（避免 PG 不支持的 ORDER BY LIMIT）
      await client.query(
        `UPDATE oa_approval_nodes
         SET is_countersign = true, countersign_parent_node_id = $1
         WHERE id = $2`,
        [currentNode.id, insertedNode.id]
      );

      currentInsertAfter++;
    }

    // 前加签时需要更新当前节点顺序指向第一个新插入的加签节点
    if (countersignType === 'before') {
      await client.query(
        `UPDATE oa_approval_instances SET current_node_order = $1, updated_at = NOW() WHERE id = $2`,
        [insertAfterOrder + 1, instanceId]
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
    enqueueSendApprovalNotification('countersign', instanceId, {
      countersignUserIds,
      fromUserName: userName,
    }).catch(err => {
      log.error('加签通知任务入队失败:', err);
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

  await transaction(async client => {
    // 实例级分布式锁 + 行锁，防止多实例并发状态覆盖
    await client.query('SELECT pg_advisory_xact_lock($1)', [instanceId]);

    const instanceResult = await client.query<OaInstanceRow>(
      `SELECT * FROM oa_approval_instances WHERE id = $1 FOR UPDATE`,
      [instanceId]
    );

    if (instanceResult.rows.length === 0) {
      throw new Error('审批实例不存在');
    }

    const instance = instanceResult.rows[0];

    if (instance.status !== 'pending') {
      throw new Error('只有审批中的申请可以撤回');
    }

    if (instance.applicant_id !== userId) {
      throw new Error('只有申请人可以撤回审批');
    }

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
    // 取消所有被取消节点审批人的钉钉待办 + 完成壳实例（completeAllPendingTodos 内部已包含壳实例终结）
    enqueueCompleteAllPendingTodos(instanceId, 'refuse').catch(err => {
      log.error('批量取消钉钉待办任务入队失败:', err);
    });
    enqueueSendApprovalNotification('withdrawn', instanceId, {
      applicantName: userName,
    }).catch(err => {
      log.error('撤回通知任务入队失败:', err);
    });
  });
}


