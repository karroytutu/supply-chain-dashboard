/**
 * OA一次性操作Token服务
 * 用于钉钉ActionCard按钮URL中的短期一次性Token
 * 安全措施：64字符crypto随机hex、30分钟过期、单次使用、绑定用户+实例+操作
 * @module services/oa/oa-action-token
 */

import * as crypto from 'crypto';
import { appQuery as query } from '../../db/appPool';
import { OA_ACTION_TOKEN_EXPIRY_MINUTES } from '../../utils/constants';

/** Token验证结果 */
export interface ActionTokenData {
  instanceId: number;
  userId: number;
  action: string;
  nodeOrder: number;
}

/**
 * 生成一次性操作Token
 * @param instanceId 审批实例ID
 * @param userId 用户ID
 * @param action 操作类型（'approve' / 'view'）
 * @param nodeOrder 审批节点序号
 * @returns 生成的token字符串
 */
export async function generateActionToken(
  instanceId: number,
  userId: number,
  action: string,
  nodeOrder: number
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + OA_ACTION_TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO oa_action_tokens (token, instance_id, user_id, action, node_order, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [token, instanceId, userId, action, nodeOrder, expiresAt]
  );

  return token;
}

/**
 * 为多个用户批量生成操作Token
 * @param instanceId 审批实例ID
 * @param userIds 用户ID列表
 * @param action 操作类型
 * @param nodeOrder 审批节点序号
 * @returns userId -> token 的映射
 */
export async function generateActionTokens(
  instanceId: number,
  userIds: number[],
  action: string,
  nodeOrder: number
): Promise<Map<number, string>> {
  const tokenMap = new Map<number, string>();
  const expiresAt = new Date(Date.now() + OA_ACTION_TOKEN_EXPIRY_MINUTES * 60 * 1000);

  // 批量生成Token
  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIdx = 1;

  for (const userId of userIds) {
    const token = crypto.randomBytes(32).toString('hex');
    tokenMap.set(userId, token);
    values.push(token, instanceId, userId, action, nodeOrder, expiresAt);
    placeholders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`);
    paramIdx += 6;
  }

  await query(
    `INSERT INTO oa_action_tokens (token, instance_id, user_id, action, node_order, expires_at)
     VALUES ${placeholders.join(', ')}`,
    values
  );

  return tokenMap;
}

/**
 * 验证Token有效性（不消费）
 * @param token Token字符串
 * @returns Token数据，无效时返回null
 */
export async function validateActionToken(token: string): Promise<ActionTokenData | null> {
  const result = await query<{
    instance_id: number;
    user_id: number;
    action: string;
    node_order: number;
    status: string;
    expires_at: Date;
  }>(
    `SELECT instance_id, user_id, action, node_order, status, expires_at
     FROM oa_action_tokens
     WHERE token = $1`,
    [token]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // 检查状态
  if (row.status !== 'active') {
    return null;
  }

  // 检查过期
  if (new Date() > row.expires_at) {
    // 标记为过期
    await query(
      `UPDATE oa_action_tokens SET status = 'expired' WHERE token = $1 AND status = 'active'`,
      [token]
    );
    return null;
  }

  return {
    instanceId: row.instance_id,
    userId: row.user_id,
    action: row.action,
    nodeOrder: row.node_order,
  };
}

/**
 * 消费Token（标记为已使用）
 * Token验证通过后调用，确保单次使用
 * @param token Token字符串
 */
export async function consumeActionToken(token: string): Promise<void> {
  await query(
    `UPDATE oa_action_tokens SET status = 'used', used_at = CURRENT_TIMESTAMP
     WHERE token = $1 AND status = 'active'`,
    [token]
  );
}

/**
 * 验证并消费Token（原子操作）
 * 使用单条SQL实现“检查有效+标记已使用”原子化，避免并发重复消费
 * @param token Token字符串
 * @returns Token数据，无效时返回null
 */
export async function validateAndConsumeActionToken(token: string): Promise<ActionTokenData | null> {
  const result = await query<{
    instance_id: number;
    user_id: number;
    action: string;
    node_order: number;
  }>(
    `UPDATE oa_action_tokens
       SET status = 'used', used_at = CURRENT_TIMESTAMP
     WHERE token = $1
       AND status = 'active'
       AND expires_at > CURRENT_TIMESTAMP
     RETURNING instance_id, user_id, action, node_order`,
    [token]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    instanceId: row.instance_id,
    userId: row.user_id,
    action: row.action,
    nodeOrder: row.node_order,
  };
}

/**
 * 清理过期的Token记录
 * 删除24小时前创建的已使用/已过期Token
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await query(
    `DELETE FROM oa_action_tokens
     WHERE status IN ('used', 'expired')
       AND created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'`
  );
  return result.rowCount ?? 0;
}
