/**
 * OA - 退回操作（流转路由）
 * @module services/oa/mutations/send-back-approval
 *
 * 退回是一个中性的流转路由机制，不带有"做错了打回重做"的含义。
 * 它将当前环节的任务流转到另一个环节（可以是前序环节），
 * 与"同意并流转到下一环节"是同级别的流转能力，区别在于流转方向可以向前跳转。
 *
 * 与 reject（拒绝=终止）的区别：退回不终止实例，实例保持 pending 状态。
 */
import { createLogger } from '../../../utils/logger';
const log = createLogger('OA');

import { appQuery as query } from '../../../db/appPool';
import { AttachmentMeta, OaInstanceRow, OaNodeRow } from '../oa.types';
import { isCurrentApprover, getCurrentApproverNode } from '../oa-utils';
import { transaction, sendBackToNode } from './shared-utils';
import {
  enqueueCompleteApprovalTodo,
  enqueueSendApprovalNotification,
} from '../oa-async-task.service';

/**
 * 退回审批（流转路由）
 * 将流程从当前环节退回到指定环节：
 * - 当前环节标记 send_back
 * - 目标环节重置为 pending（重新解析处理人）
 * - 中间环节重置为 pending（保留历史记录在 oa_approval_actions 中）
 * - 更新 current_node_order 指向目标环节
 *
 * 实例保持 pending 状态，不终止。
 *
 * @param instanceId 审批实例 ID
 * @param userId 操作用户 ID
 * @param userName 操作用户名
 * @param targetNodeOrder 退回目标环节序号（必须 < 当前环节序号）
 * @param comment 退回原因（选填）
 */
export async function sendBackApproval(
  instanceId: number,
  userId: number,
  userName: string,
  targetNodeOrder: number,
  comment?: string,
  attachments?: AttachmentMeta[]
): Promise<void> {
  // 1. 校验：当前用户是否为当前环节审批人
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
    const instance = instanceResult.rows[0];
    if (instance.status !== 'pending') {
      throw new Error('审批实例不在待处理状态，无法退回');
    }

    // 获取当前审批节点
    const currentNode = await getCurrentApproverNode(client, instanceId, userId);
    if (!currentNode) {
      throw new Error('未找到当前审批节点');
    }

    // 2. 校验：targetNodeOrder 必须 < 当前环节序号
    if (targetNodeOrder >= currentNode.node_order) {
      throw new Error('退回目标环节必须在当前环节之前');
    }

    // 获取目标节点（取最新 round）
    const targetNodeResult = await client.query<OaNodeRow>(
      `SELECT * FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_order = $2
       ORDER BY round DESC LIMIT 1`,
      [instanceId, targetNodeOrder]
    );
    if (targetNodeResult.rows.length === 0) {
      throw new Error('退回目标环节不存在');
    }
    const targetNode = targetNodeResult.rows[0];

    // 3. 校验：目标环节不能是 auto 类型
    if (targetNode.node_type === 'auto') {
      throw new Error('不能退回到自动环节');
    }

    // 4. 校验：目标环节与当前环节之间不能有 pending/processing 的 auto 节点
    const autoBetween = await client.query(
      `SELECT id, node_name FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_type = 'auto'
         AND node_order > $2 AND node_order < $3
         AND status IN ('pending', 'processing')`,
      [instanceId, targetNodeOrder, currentNode.node_order]
    );
    if (autoBetween.rows.length > 0) {
      throw new Error(
        `无法退回：目标环节与当前环节之间存在未完成的自动环节(${autoBetween.rows[0].node_name})`
      );
    }

    // 重新解析目标环节的处理人（角色→用户），更新 assigned_user_ids
    let targetUserIds: number[] | null = targetNode.assigned_user_ids;

    if (targetNode.role_code) {
      const roleResult = await client.query<{ user_id: number }>(
        `SELECT DISTINCT ur.user_id
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         JOIN users u ON u.id = ur.user_id
         WHERE r.code = $1 AND r.status = 1 AND u.status = 1`,
        [targetNode.role_code]
      );
      if (roleResult.rows.length > 0) {
        targetUserIds = roleResult.rows.map(r => r.user_id);
      }
    }

    // 更新目标环节的 assigned_user_ids（退回时重新解析处理人）
    await client.query(
      `UPDATE oa_approval_nodes SET assigned_user_ids = $1 WHERE id = $2`,
      [targetUserIds, targetNode.id]
    );

    // 将当前环节的同 order 其他 pending 节点也标记为 send_back（多人签署场景）
    await client.query(
      `UPDATE oa_approval_nodes SET status = 'send_back', acted_at = NOW()
       WHERE instance_id = $1 AND node_order = $2 AND status = 'pending' AND id != $3`,
      [instanceId, currentNode.node_order, currentNode.id]
    );

    // 通用退回操作（当前环节 → send_back，目标/中间环节 → pending，更新指针）
    await sendBackToNode(
      client, instanceId,
      currentNode.id, currentNode.node_order,
      targetNodeOrder
    );

    // 记录操作日志（action_type='send_back'）
    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order, comment, details, attachments)
       VALUES ($1, 'send_back', $2, $3, $4, $5, $6, $7)`,
      [
        instanceId,
        userId,
        userName,
        currentNode.node_order,
        comment?.trim() || null,
        JSON.stringify({
          targetNodeOrder,
          targetNodeName: targetNode.node_name,
          targetUserIds,
        }),
        attachments && attachments.length > 0 ? JSON.stringify(attachments) : null,
      ]
    );
  });

  // 事务外：异步通知
  setImmediate(() => {
    // 完成退回人的钉钉待办
    enqueueCompleteApprovalTodo(instanceId, userId, 'AGREE').catch(err => {
      log.error('完成退回人钉钉待办任务入队失败:', err);
    });

    // 查询目标环节处理人，发送待审批通知
    query<{ assigned_user_ids: number[] | null; node_name: string }>(
      `SELECT assigned_user_ids, node_name FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_order = $2 AND status = 'pending'
       ORDER BY round DESC LIMIT 1`,
      [instanceId, targetNodeOrder]
    ).then(result => {
      const node = result.rows[0];
      const approverIds = Array.isArray(node?.assigned_user_ids) ? node.assigned_user_ids : [];
      if (approverIds.length > 0) {
        enqueueSendApprovalNotification('pending', instanceId, {
          approverIds,
          nodeName: node.node_name,
          nodeOrder: targetNodeOrder,
        }).catch(err => {
          log.error('退回通知任务入队失败:', err);
        });
      }
    }).catch(err => {
      log.error('查询退回目标环节失败:', err);
    });
  });
}
