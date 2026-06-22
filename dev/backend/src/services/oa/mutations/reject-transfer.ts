/**
 * OA - 拒绝 + 转交操作
 * @module services/oa/mutations/reject-transfer
 */
import { createLogger } from '../../../utils/logger';
const log = createLogger('OA');

import { appQuery as query } from '../../../db/appPool';
import { OaInstanceRow } from '../oa.types';
import { isCurrentApprover, getCurrentApproverNode } from '../oa-utils';
import { getFormTypeByCode } from '../form-types';
import {
  enqueueCompleteApprovalTodo,
  enqueueCompleteAllPendingTodos,
  enqueueSendApprovalNotification,
} from '../oa-async-task.service';
import { transaction } from './shared-utils';

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
      throw new Error('审批实例不在处理中，无法执行此操作');
    }

    const currentNode = await getCurrentApproverNode(client, instanceId, userId);
    if (!currentNode) {
      throw new Error('未找到待审批节点');
    }

    await client.query(
      `UPDATE oa_approval_nodes SET status = 'rejected', comment = NULL, acted_at = NOW() WHERE id = $1`,
      [currentNode.id]
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
      [instanceId, userId, userName, currentNode.node_order, null]
    );

    // 拒绝原因作为独立 comment 记录插入（统一评论模型）
    if (comment && comment.trim()) {
      await client.query(
        `INSERT INTO oa_approval_actions
          (instance_id, action_type, operator_id, operator_name, node_order, comment)
         VALUES ($1, 'comment', $2, $3, $4, $5)`,
        [instanceId, userId, userName, currentNode.node_order, comment.trim()]
      );
    }

    // 触发审批驳回回调
    const instResult = await client.query<OaInstanceRow>(
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
        ft!.onRejected!(rejectedInstance, rejectedFormData).catch(err => {
          log.error(`审批驳回回调执行失败 [${ft!.code}]:`, err);
        });
      });
    }
  });

  setImmediate(() => {
    // 拒绝审批后取消所有待处理人的钉钉待办 + 完成壳实例（completeAllPendingTodos 内部已包含壳实例终结）
    enqueueCompleteAllPendingTodos(instanceId, 'refuse').catch(err => {
      log.error('批量取消钉钉待办任务入队失败:', err);
    });
    enqueueSendApprovalNotification('rejected', instanceId, {
      rejectUserName: userName,
      reason: comment,
    }).catch(err => {
      log.error('拒绝通知任务入队失败:', err);
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

  const targetUserResult = await query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [
    transferToUserId,
  ]);

  if (targetUserResult.rows.length === 0) {
    throw new Error('转交目标用户不存在');
  }

  const targetUserName = targetUserResult.rows[0].name;

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
      throw new Error('审批实例不在处理中，无法执行此操作');
    }

    const currentNode = await getCurrentApproverNode(client, instanceId, userId);
    if (!currentNode) {
      throw new Error('未找到待审批节点');
    }

    await client.query(
      `UPDATE oa_approval_nodes
       SET assigned_user_ids = $1,
           comment = $2, acted_at = NOW(),
           reminder_count = 0, last_reminder_at = NULL, cc_supervisor_at = NULL
       WHERE id = $3`,
      [[transferToUserId], `由 ${userName} 转交`, currentNode.id]
    );

    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order, comment, details)
       VALUES ($1, 'transfer', $2, $3, $4, $5, $6)`,
      [
        instanceId,
        userId,
        userName,
        currentNode.node_order,
        null,
        JSON.stringify({ transferToUserId, transferToUserName: targetUserName }),
      ]
    );

    // 如果用户填写了转交备注，作为独立 comment 记录插入（统一评论模型）
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
    // 新增：完成转交人的钉钉待办（异步任务，支持失败重试）
    enqueueCompleteApprovalTodo(instanceId, userId, 'AGREE').catch(err => {
      log.error('完成转交人钉钉待办任务入队失败:', err);
    });
    enqueueSendApprovalNotification('transferred', instanceId, {
      transferToUserId,
      fromUserName: userName,
    }).catch(err => {
      log.error('转交通知任务入队失败:', err);
    });
  });
}


