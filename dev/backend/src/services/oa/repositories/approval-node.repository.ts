/**
 * OA 审批节点 Repository（最小封装）
 * @module services/oa/repositories/approval-node.repository
 *
 * 将高频出现的节点查询/更新 SQL 集中，新代码优先使用。
 * 渐进式迁移：当前仅 update-instance.ts 使用，后续逐步替换其他 mutation 文件中的内联 SQL。
 */

import type { PoolClient } from 'pg';
import type { OaNodeRow, ApprovalNodeStatus } from '../oa.types';

/**
 * 查询当前用户的待审批节点（需与实例 current_node_order 匹配）
 */
export async function getCurrentPendingNodeByUser(
  client: PoolClient,
  instanceId: number,
  userId: number
): Promise<OaNodeRow | undefined> {
  const result = await client.query<OaNodeRow>(
    `SELECT n.* FROM oa_approval_nodes n
     JOIN oa_approval_instances i ON i.id = n.instance_id
     WHERE n.instance_id = $1
       AND n.assigned_user_id = $2
       AND n.status = 'pending'
       AND n.node_order = i.current_node_order
     LIMIT 1`,
    [instanceId, userId]
  );
  return result.rows[0];
}

/**
 * 按 ID 更新节点状态
 */
export async function updateNodeStatus(
  client: PoolClient,
  nodeId: number,
  status: ApprovalNodeStatus,
  options: { comment?: string | null; actedAt?: Date | null } = {}
): Promise<void> {
  const fields: string[] = ['status = $2'];
  const params: unknown[] = [nodeId, status];

  if (options.comment !== undefined) {
    fields.push(`comment = $${params.length + 1}`);
    params.push(options.comment);
  }

  if (options.actedAt !== undefined) {
    fields.push(`acted_at = $${params.length + 1}`);
    params.push(options.actedAt);
  }

  await client.query(
    `UPDATE oa_approval_nodes SET ${fields.join(', ')} WHERE id = $1`,
    params
  );
}

/**
 * 取消实例下所有 pending 节点
 */
export async function cancelAllPendingNodes(
  client: PoolClient,
  instanceId: number,
  options: { excludeNodeId?: number } = {}
): Promise<void> {
  if (options.excludeNodeId !== undefined) {
    await client.query(
      `UPDATE oa_approval_nodes SET status = 'cancelled'
       WHERE instance_id = $1 AND status = 'pending' AND id != $2`,
      [instanceId, options.excludeNodeId]
    );
  } else {
    await client.query(
      `UPDATE oa_approval_nodes SET status = 'cancelled' WHERE instance_id = $1 AND status = 'pending'`,
      [instanceId]
    );
  }
}

/**
 * 查询实例下第一个 pending 节点（按 node_order）
 */
export async function getFirstPendingNode(
  client: PoolClient,
  instanceId: number
): Promise<OaNodeRow | undefined> {
  const result = await client.query<OaNodeRow>(
    `SELECT * FROM oa_approval_nodes
     WHERE instance_id = $1 AND status = 'pending'
     ORDER BY node_order LIMIT 1`,
    [instanceId]
  );
  return result.rows[0];
}
