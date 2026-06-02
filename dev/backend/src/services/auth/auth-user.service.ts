/**
 * 认证服务 - 用户管理与权限工具
 * @module services/auth/auth-user.service
 */

import { appQuery, getAppClient } from '../../db/appPool';
import type { DingtalkUserInfo } from '../dingtalk.service';

export interface LoginResult {
  success: boolean;
  token?: string;
  user?: UserInfo;
  message?: string;
}

export interface UserInfo {
  id: number;
  name: string;
  avatar: string;
  mobile: string;
  email: string;
  departmentId: string;
  departmentName: string;
  position: string;
  roles: RoleInfo[];
  permissions: string[];
}

export interface RoleInfo {
  id: number;
  code: string;
  name: string;
}

/**
 * 创建或更新用户
 */
export async function createOrUpdateUser(
  dingtalkUser: DingtalkUserInfo
): Promise<any> {
  const client = await getAppClient();
  
  try {
    await client.query('BEGIN');
    
    const existingUser = await client.query(
      'SELECT * FROM users WHERE dingtalk_user_id = $1 OR dingtalk_union_id = $2',
      [dingtalkUser.userid, dingtalkUser.unionid]
    );
    
    let user;
    
    if (existingUser.rows.length > 0) {
      const updateResult = await client.query(
        `UPDATE users SET
          dingtalk_user_id = $1,
          dingtalk_union_id = $2,
          name = $3,
          avatar = $4,
          mobile = $5,
          email = $6,
          department_id = $7,
          position = $8,
          last_login_at = NOW(),
          updated_at = NOW()
        WHERE id = $9
        RETURNING *`,
        [
          dingtalkUser.userid,
          dingtalkUser.unionid,
          dingtalkUser.name,
          dingtalkUser.avatar || '',
          dingtalkUser.mobile || '',
          dingtalkUser.email || '',
          dingtalkUser.department_id?.[0]?.toString() || '',
          dingtalkUser.title || '',
          existingUser.rows[0].id,
        ]
      );
      user = updateResult.rows[0];
    } else {
      const insertResult = await client.query(
        `INSERT INTO users (dingtalk_user_id, dingtalk_union_id, name, avatar, mobile, email, department_id, position, last_login_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *`,
        [
          dingtalkUser.userid,
          dingtalkUser.unionid,
          dingtalkUser.name,
          dingtalkUser.avatar || '',
          dingtalkUser.mobile || '',
          dingtalkUser.email || '',
          dingtalkUser.department_id?.[0]?.toString() || '',
          dingtalkUser.title || '',
        ]
      );
      user = insertResult.rows[0];
      
      const viewerRole = await client.query('SELECT id FROM roles WHERE code = $1', ['viewer']);
      if (viewerRole.rows.length > 0) {
        await client.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
          [user.id, viewerRole.rows[0].id]
        );
      }
    }
    
    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 获取用户角色和权限
 */
export async function getUserRolesAndPermissions(userId: number): Promise<{ roles: RoleInfo[]; permissions: string[] }> {
  const rolesResult = await appQuery<RoleInfo>(
    `SELECT r.id, r.code, r.name
    FROM roles r
    JOIN user_roles ur ON r.id = ur.role_id
    WHERE ur.user_id = $1 AND r.status = 1`,
    [userId]
  );
  
  const roles = rolesResult.rows;
  
  const permissionsResult = await appQuery<{ code: string }>(
    `SELECT DISTINCT p.code
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    JOIN user_roles ur ON rp.role_id = ur.role_id
    WHERE ur.user_id = $1`,
    [userId]
  );
  
  const permissions = permissionsResult.rows.map(r => r.code);
  
  return { roles, permissions };
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser(userId: number): Promise<UserInfo | null> {
  const result = await appQuery<any>(
    'SELECT * FROM users WHERE id = $1 AND status = 1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const user = result.rows[0];
  const { roles, permissions } = await getUserRolesAndPermissions(userId);

  return {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    mobile: user.mobile,
    email: user.email,
    departmentId: user.department_id,
    departmentName: user.department_name,
    position: user.position,
    roles,
    permissions,
  };
}

/**
 * 记录登录日志
 */
export async function recordLoginLog(
  userId: number,
  loginType: string,
  ipAddress?: string,
  userAgent?: string,
  success: boolean = true,
  failureReason?: string
): Promise<void> {
  await appQuery(
    `INSERT INTO login_logs (user_id, login_type, ip_address, user_agent, status, failure_reason)
    VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, loginType, ipAddress, userAgent, success ? 1 : 0, failureReason]
  );
}
