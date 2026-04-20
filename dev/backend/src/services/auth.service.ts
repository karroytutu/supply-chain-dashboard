import { appQuery, getAppClient } from '../db/appPool';
import { generateToken, JwtPayload } from '../utils/jwt';
import {
  getUserInfoByAuthCode,
  getUserInfoByCode,
  DingtalkUserInfo,
} from './dingtalk.service';

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
 * 钉钉免登
 */
export async function autoLogin(authCode: string, ipAddress?: string, userAgent?: string): Promise<LoginResult> {
  try {
    // 获取钉钉用户信息（SDK方式已返回完整信息）
    const dingtalkUser = await getUserInfoByAuthCode(authCode);

    // 创建或更新用户
    const user = await createOrUpdateUser(dingtalkUser);

    // 检查用户状态，禁用用户不允许登录
    if (!user.status || user.status !== 1) {
      await recordLoginLog(user.id, 'dingtalk_auto', ipAddress, userAgent, false, '账户已被禁用');
      return {
        success: false,
        message: '账户已被禁用，请联系管理员',
      };
    }

    // 记录登录日志
    await recordLoginLog(user.id, 'dingtalk_auto', ipAddress, userAgent, true);
    
    // 获取用户角色和权限
    const { roles, permissions } = await getUserRolesAndPermissions(user.id);
    
    // 生成JWT Token
    const payload: JwtPayload = {
      userId: user.id,
      dingtalkUserId: dingtalkUser.userid,
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
        departmentId: user.department_id,
        departmentName: user.department_name,
        position: user.position,
        roles,
        permissions,
      },
    };
  } catch (error: any) {
    console.error('钉钉免登失败:', error.message);
    return {
      success: false,
      message: error.message || '登录失败',
    };
  }
}

/**
 * 扫码登录回调
 */
export async function qrcodeCallback(code: string, ipAddress?: string, userAgent?: string): Promise<LoginResult> {
  try {
    // 获取钉钉用户信息（SDK方式已返回完整信息）
    const dingtalkUser = await getUserInfoByCode(code);

    // 创建或更新用户
    const user = await createOrUpdateUser(dingtalkUser);

    // 检查用户状态，禁用用户不允许登录
    if (!user.status || user.status !== 1) {
      await recordLoginLog(user.id, 'dingtalk_qrcode', ipAddress, userAgent, false, '账户已被禁用');
      return {
        success: false,
        message: '账户已被禁用，请联系管理员',
      };
    }

    // 记录登录日志
    await recordLoginLog(user.id, 'dingtalk_qrcode', ipAddress, userAgent, true);
    
    // 获取用户角色和权限
    const { roles, permissions } = await getUserRolesAndPermissions(user.id);
    
    // 生成JWT Token
    const payload: JwtPayload = {
      userId: user.id,
      dingtalkUserId: dingtalkUser.userid,
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
        departmentId: user.department_id,
        departmentName: user.department_name,
        position: user.position,
        roles,
        permissions,
      },
    };
  } catch (error: any) {
    console.error('扫码登录失败:', error.message);
    return {
      success: false,
      message: error.message || '登录失败',
    };
  }
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
 * 创建或更新用户
 */
async function createOrUpdateUser(
  dingtalkUser: DingtalkUserInfo
): Promise<any> {
  const client = await getAppClient();
  
  try {
    await client.query('BEGIN');
    
    // 检查用户是否存在（通过 user_id 或 union_id 查找，因为钉钉 userid 可能变化）
    const existingUser = await client.query(
      'SELECT * FROM users WHERE dingtalk_user_id = $1 OR dingtalk_union_id = $2',
      [dingtalkUser.userid, dingtalkUser.unionid]
    );
    
    let user;
    
    if (existingUser.rows.length > 0) {
      // 更新用户信息（同时更新 dingtalk_user_id，因为可能已变化）
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
      // 创建新用户
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
      
      // 为新用户分配默认角色 (viewer)
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
 * @param userId 用户ID
 * @returns 角色列表和权限编码数组
 */
export async function getUserRolesAndPermissions(userId: number): Promise<{ roles: RoleInfo[]; permissions: string[] }> {
  // 获取用户角色
  const rolesResult = await appQuery<RoleInfo>(
    `SELECT r.id, r.code, r.name
    FROM roles r
    JOIN user_roles ur ON r.id = ur.role_id
    WHERE ur.user_id = $1 AND r.status = 1`,
    [userId]
  );
  
  const roles = rolesResult.rows;
  
  // 获取用户权限（通过角色）
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
 * 记录登录日志
 */
async function recordLoginLog(
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

/**
 * 开发环境管理员登录（仅用于开发调试）
 */
export async function devLogin(ipAddress?: string, userAgent?: string): Promise<LoginResult> {
  // 仅允许开发环境
  if (process.env.NODE_ENV === 'production') {
    return {
      success: false,
      message: '开发登录仅用于开发环境',
    };
  }

  try {
    // 查找或创建开发管理员账号
    let user = await appQuery<any>(
      "SELECT * FROM users WHERE dingtalk_user_id = 'dev_admin'",
      []
    );

    if (user.rows.length === 0) {
      // 创建开发管理员
      const insertResult = await appQuery(
        `INSERT INTO users (dingtalk_user_id, dingtalk_union_id, name, avatar, mobile, email, status, last_login_at)
        VALUES ('dev_admin', 'dev_admin', '开发管理员', '', '', '', 1, NOW())
        RETURNING *`,
        []
      );
      user = insertResult;

      // 分配管理员角色
      const adminRole = await appQuery('SELECT id FROM roles WHERE code = $1', ['admin']);
      if (adminRole.rows.length > 0) {
        await appQuery(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
          [user.rows[0].id, adminRole.rows[0].id]
        );
      } else {
        // 如果没有admin角色，创建一个
        const createRoleResult = await appQuery(
          `INSERT INTO roles (code, name, description, is_system, status)
          VALUES ('admin', '管理员', '系统管理员', true, 1)
          RETURNING *`,
          []
        );
        await appQuery(
          'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
          [user.rows[0].id, createRoleResult.rows[0].id]
        );

        // 为管理员角色分配所有权限
        const permissions = await appQuery('SELECT id FROM permissions');
        for (const perm of permissions.rows) {
          await appQuery(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
            [createRoleResult.rows[0].id, perm.id]
          );
        }
      }
    } else {
      // 更新最后登录时间
      await appQuery(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.rows[0].id]
      );
    }

    const userData = user.rows[0];

    // 记录登录日志
    await recordLoginLog(userData.id, 'dev_login', ipAddress, userAgent, true);

    // 获取用户角色和权限
    const { roles, permissions } = await getUserRolesAndPermissions(userData.id);

    // 生成JWT Token
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
        avatar: userData.avatar,
        mobile: userData.mobile,
        email: userData.email,
        departmentId: userData.department_id,
        departmentName: userData.department_name,
        position: userData.position,
        roles,
        permissions,
      },
    };
  } catch (error: any) {
    console.error('开发登录失败:', error.message);
    return {
      success: false,
      message: error.message || '登录失败',
    };
  }
}
