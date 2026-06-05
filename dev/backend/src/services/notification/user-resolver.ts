/**
 * 通知用户解析服务
 * 解析系统用户ID → 钉钉用户ID，供各业务模块通知发送使用
 * @module services/notification/user-resolver
 */

import { appQuery } from '../../db/appPool';

/**
 * 根据系统用户ID查询钉钉用户ID
 * 仅返回活跃且已绑定钉钉的用户，过滤 dev_admin
 */
export async function getDingtalkUserIds(userIds: number[]): Promise<string[]> {
  if (!userIds || userIds.length === 0) return [];

  const result = await appQuery<{ dingtalk_user_id: string }>(
    `SELECT dingtalk_user_id FROM users
     WHERE id = ANY($1) AND status = 1 AND dingtalk_user_id IS NOT NULL`,
    [userIds]
  );
  return result.rows
    .map(row => row.dingtalk_user_id)
    .filter(id => id && id !== 'dev_admin');
}

/**
 * 根据角色编码查询钉钉用户ID列表
 * 仅返回活跃角色中已绑定钉钉的用户
 */
export async function getDingtalkUserIdsByRole(roleCode: string): Promise<string[]> {
  const result = await appQuery<{ dingtalk_user_id: string }>(
    `SELECT u.dingtalk_user_id
     FROM users u
     JOIN user_roles ur ON u.id = ur.user_id
     JOIN roles r ON ur.role_id = r.id
     WHERE r.code = $1 AND u.status = 1 AND r.status = 1
       AND u.dingtalk_user_id IS NOT NULL`,
    [roleCode]
  );
  return result.rows
    .map(row => row.dingtalk_user_id)
    .filter(id => id && id !== 'dev_admin');
}
