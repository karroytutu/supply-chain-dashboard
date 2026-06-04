/**
 * 认证服务 - 开发环境工具
 * @module services/auth/auth-dev.service
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('Auth');

import { appQuery } from '../../db/appPool';
import { generateToken, JwtPayload } from '../../utils/jwt';
import { getErrorMessage } from '../../utils/errorUtils';
import {
  type LoginResult,
  type RoleInfo,
  getCurrentUser,
  getUserRolesAndPermissions,
  recordLoginLog,
} from './auth-user.service';

/**
 * 切换用户
 */
export async function devSwitchUser(userId: number): Promise<LoginResult> {
  try {
    const user = await getCurrentUser(userId);

    if (!user) {
      return {
        success: false,
        message: '用户不存在或已被禁用',
      };
    }

    const { roles, permissions } = await getUserRolesAndPermissions(userId);

    const payload: JwtPayload = {
      userId: user.id,
      dingtalkUserId: `dev_switch_${userId}`,
      name: user.name,
      roles: roles.map(r => r.code),
      permissions,
    };

    const token = generateToken(payload);

    return {
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        mobile: user.mobile,
        email: user.email,
        departmentId: user.departmentId,
        departmentName: user.departmentName,
        position: user.position,
        roles,
        permissions,
      },
    };
  } catch (error) {
    log.error('开发切换用户失败:', getErrorMessage(error));
    return {
      success: false,
      message: getErrorMessage(error) || '切换用户失败',
    };
  }
}

/**
 * 获取可切换用户列表
 */
export async function devGetUsers(): Promise<
  { id: number; name: string; avatar?: string; roles: RoleInfo[] }[]
> {
  try {
    const result = await appQuery<any>(
      `SELECT u.id, u.name, u.avatar,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT('id', r.id, 'code', r.code, 'name', r.name)
            ORDER BY r.id
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id AND r.status = 1
      WHERE u.status = 1
      GROUP BY u.id, u.name, u.avatar
      ORDER BY u.id`,
      []
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      roles: row.roles || [],
    }));
  } catch (error) {
    log.error('获取开发用户列表失败:', getErrorMessage(error));
    return [];
  }
}

/**
 * 开发环境管理员登录
 */
export async function devLogin(ipAddress?: string, userAgent?: string): Promise<LoginResult> {
  if (process.env.NODE_ENV === 'production') {
    return {
      success: false,
      message: '开发登录仅用于开发环境',
    };
  }

  try {
    let user = await appQuery<any>("SELECT * FROM users WHERE dingtalk_user_id = 'dev_admin'", []);

    if (user.rows.length === 0) {
      const insertResult = await appQuery(
        `INSERT INTO users (dingtalk_user_id, dingtalk_union_id, name, avatar, mobile, email, status, last_login_at)
        VALUES ('dev_admin', 'dev_admin', '开发管理员', '', '', '', 1, NOW())
        RETURNING *`,
        []
      );
      user = insertResult;

      const adminRole = await appQuery('SELECT id FROM roles WHERE code = $1', ['admin']);
      if (adminRole.rows.length > 0) {
        await appQuery('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
          user.rows[0].id,
          adminRole.rows[0].id,
        ]);
      } else {
        const createRoleResult = await appQuery(
          `INSERT INTO roles (code, name, description, is_system, status)
          VALUES ('admin', '管理员', '系统管理员', true, 1)
          RETURNING *`,
          []
        );
        await appQuery('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
          user.rows[0].id,
          createRoleResult.rows[0].id,
        ]);

        const permissions = await appQuery('SELECT id FROM permissions');
        for (const perm of permissions.rows) {
          await appQuery('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [
            createRoleResult.rows[0].id,
            perm.id,
          ]);
        }
      }
    } else {
      await appQuery('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.rows[0].id]);
    }

    const userData = user.rows[0];

    await recordLoginLog(userData.id, 'dev_login', ipAddress, userAgent, true);

    const { roles, permissions } = await getUserRolesAndPermissions(userData.id);

    const payload: JwtPayload = {
      userId: userData.id,
      dingtalkUserId: 'dev_admin',
      name: userData.name,
      roles: roles.map(r => r.code),
      permissions,
    };

    const token = generateToken(payload);

    return {
      success: true,
      token,
      user: {
        id: userData.id,
        name: userData.name,
        avatar: userData.avatar || '',
        mobile: userData.mobile || '',
        email: userData.email || '',
        departmentId: userData.department_id || '',
        departmentName: '',
        position: userData.position || '',
        roles,
        permissions,
      },
    };
  } catch (error) {
    log.error('开发登录失败:', getErrorMessage(error));
    return {
      success: false,
      message: getErrorMessage(error) || '开发登录失败',
    };
  }
}
