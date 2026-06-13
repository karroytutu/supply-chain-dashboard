/**
 * 上下级关系查询
 * 基于 manager_userid 直接查询，非推导
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('Org');

import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import type { UserBrief, SupervisorResult, SubordinateResult } from './org.types';

/**
 * 获取用户的直属上级
 * 直接读 users.manager_userid → 查找对应的本地用户
 */
export async function getSupervisor(userId: number): Promise<SupervisorResult> {
  const cacheKey = `org:supervisor:${userId}`;
  const cached = cache.get<SupervisorResult>(cacheKey);
  if (cached) return cached;

  // 获取该用户的 manager_userid
  const userResult = await appQuery(
    'SELECT manager_userid FROM users WHERE id = $1 AND status = 1',
    [userId]
  );

  if (userResult.rows.length === 0 || !userResult.rows[0].manager_userid) {
    const result: SupervisorResult = { supervisor: null };
    cache.set(cacheKey, result, CACHE_TTL.LOW_FREQUENCY);
    return result;
  }

  // 通过 manager_userid 查找上级用户
  const supervisorResult = await appQuery(
    `SELECT id, name, avatar, position, department_name, dingtalk_user_id
     FROM users
     WHERE dingtalk_user_id = $1 AND status = 1`,
    [userResult.rows[0].manager_userid]
  );

  const result: SupervisorResult = {
    supervisor: supervisorResult.rows.length > 0
      ? toUserBrief(supervisorResult.rows[0])
      : null,
  };

  cache.set(cacheKey, result, CACHE_TTL.LOW_FREQUENCY);
  return result;
}

/**
 * 获取用户的直属下属
 * 查找 manager_userid 等于该用户 dingtalk_user_id 的所有在职用户
 */
export async function getSubordinates(userId: number): Promise<SubordinateResult> {
  const cacheKey = `org:subordinates:${userId}`;
  const cached = cache.get<SubordinateResult>(cacheKey);
  if (cached) return cached;

  // 获取该用户的 dingtalk_user_id
  const userResult = await appQuery(
    'SELECT dingtalk_user_id FROM users WHERE id = $1 AND status = 1',
    [userId]
  );

  if (userResult.rows.length === 0 || !userResult.rows[0].dingtalk_user_id) {
    const result: SubordinateResult = { subordinates: [] };
    cache.set(cacheKey, result, CACHE_TTL.LOW_FREQUENCY);
    return result;
  }

  // 查找所有 manager_userid 等于该用户 dingtalk_user_id 的在职用户
  const subsResult = await appQuery(
    `SELECT id, name, avatar, position, department_name, dingtalk_user_id
     FROM users
     WHERE manager_userid = $1 AND status = 1
     ORDER BY name`,
    [userResult.rows[0].dingtalk_user_id]
  );

  const result: SubordinateResult = {
    subordinates: subsResult.rows.map(toUserBrief),
  };

  cache.set(cacheKey, result, CACHE_TTL.LOW_FREQUENCY);
  return result;
}

function toUserBrief(row: any): UserBrief {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    position: row.position,
    department_name: row.department_name,
    dingtalk_user_id: row.dingtalk_user_id,
  };
}