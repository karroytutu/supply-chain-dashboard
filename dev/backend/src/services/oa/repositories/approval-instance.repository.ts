/**
 * OA 审批实例 Repository（最小封装）
 * @module services/oa/repositories/approval-instance.repository
 *
 * 将高频出现的实例查询/更新 SQL 集中，新代码优先使用。
 * 不一次性重构所有内联 SQL，仅覆盖本次改动中高频操作。
 */

import type { PoolClient } from 'pg';
import type { OaInstanceRow, ApprovalStatus } from '../oa.types';

/**
 * 按 ID FOR UPDATE 锁定实例，并获取实例数据
 */
export async function lockInstanceById(
  client: PoolClient,
  instanceId: number
): Promise<OaInstanceRow | undefined> {
  const result = await client.query<OaInstanceRow>(
    `SELECT * FROM oa_approval_instances WHERE id = $1 FOR UPDATE`,
    [instanceId]
  );
  return result.rows[0];
}

/**
 * 按 ID 查询实例（不加锁）
 */
export async function findInstanceById(
  client: PoolClient,
  instanceId: number
): Promise<OaInstanceRow | undefined> {
  const result = await client.query<OaInstanceRow>(
    `SELECT * FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );
  return result.rows[0];
}

/**
 * 更新实例状态
 */
export async function updateInstanceStatus(
  client: PoolClient,
  instanceId: number,
  status: ApprovalStatus,
  options: { completedAt?: Date | null; erpMeta?: Record<string, unknown> } = {}
): Promise<void> {
  const fields: string[] = ['status = $2', 'updated_at = NOW()'];
  const params: unknown[] = [instanceId, status];

  if (options.completedAt !== undefined) {
    fields.push(`completed_at = $${params.length + 1}`);
    params.push(options.completedAt);
  }

  if (options.erpMeta !== undefined) {
    fields.push(`erp_meta = $${params.length + 1}`);
    params.push(JSON.stringify(options.erpMeta));
  }

  await client.query(
    `UPDATE oa_approval_instances SET ${fields.join(', ')} WHERE id = $1`,
    params
  );
}

/**
 * 更新实例 current_node_order
 */
export async function updateInstanceCurrentNodeOrder(
  client: PoolClient,
  instanceId: number,
  nodeOrder: number
): Promise<void> {
  await client.query(
    `UPDATE oa_approval_instances SET current_node_order = $1, updated_at = NOW() WHERE id = $2`,
    [nodeOrder, instanceId]
  );
}
