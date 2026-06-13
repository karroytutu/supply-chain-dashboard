/**
 * 按部门加载用户列表
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('Org');

import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import type { DeptUserItem } from './org.types';

const CACHE_PREFIX = 'org:dept-users';

/**
 * 获取指定部门下的在职用户列表
 * @param dingtalkDeptId 钉钉部门ID
 */
export async function getDeptUsers(dingtalkDeptId: string): Promise<DeptUserItem[]> {
  const cacheKey = `${CACHE_PREFIX}:${dingtalkDeptId}`;
  const cached = cache.get<DeptUserItem[]>(cacheKey);
  if (cached) return cached;

  // 查询部门下的用户（仅在职）
  const result = await appQuery(
    `SELECT
      u.id, u.name, u.avatar, u.position, u.department_name,
      ud.is_primary, ud.is_leader, u.manager_userid
    FROM users u
    JOIN user_departments ud ON ud.user_id = u.id
    JOIN dingtalk_departments d ON d.id = ud.dept_id
    WHERE d.dingtalk_dept_id = $1 AND u.status = 1
    ORDER BY ud.is_primary DESC, u.name`,
    [dingtalkDeptId]
  );

  if (result.rows.length === 0) {
    cache.set(cacheKey, [], CACHE_TTL.LOW_FREQUENCY);
    return [];
  }

  // 批量查角色（避免 N+1）
  const userIds = result.rows.map((r: any) => r.id);
  const rolesResult = await appQuery(
    `SELECT ur.user_id, r.code, r.name
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ANY($1)`,
    [userIds]
  );

  // 构建 userId -> roles 映射
  const rolesMap = new Map<number, { code: string; name: string }[]>();
  for (const row of rolesResult.rows) {
    if (!rolesMap.has(row.user_id)) {
      rolesMap.set(row.user_id, []);
    }
    rolesMap.get(row.user_id)!.push({ code: row.code, name: row.name });
  }

  const items: DeptUserItem[] = result.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    position: row.position,
    department_name: row.department_name,
    is_primary: row.is_primary,
    is_leader: row.is_leader,
    roles: rolesMap.get(row.id) || [],
    manager_userid: row.manager_userid,
  }));

  cache.set(cacheKey, items, CACHE_TTL.LOW_FREQUENCY);
  return items;
}