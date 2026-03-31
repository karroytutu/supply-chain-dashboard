import { appQuery, getAppClient } from '../db/appPool';
import { invalidateUserPermissionCache } from './permission-cache.service';

export interface User {
  id: number;
  dingtalk_user_id: string;
  dingtalk_union_id: string;
  name: string;
  avatar: string;
  mobile: string;
  email: string;
  department_id: string;
  department_name: string;
  position: string;
  status: number;
  last_login_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UserWithRoles extends User {
  roles: { id: number; code: string; name: string }[];
}

export interface UserListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
}

export interface UserListResult {
  list: UserWithRoles[];
  total: number;
}

/**
 * 获取用户列表
 */
export async function getUserList(params: UserListParams): Promise<UserListResult> {
  const { page, pageSize, keyword, status } = params;
  const offset = (page - 1) * pageSize;
  
  let whereClause = '1=1';
  const queryParams: any[] = [];
  let paramIndex = 1;
  
  if (keyword) {
    whereClause += ` AND (name ILIKE $${paramIndex} OR mobile ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
    queryParams.push(`%${keyword}%`);
    paramIndex++;
  }
  
  if (status !== undefined) {
    whereClause += ` AND status = $${paramIndex}`;
    queryParams.push(status);
    paramIndex++;
  }
  
  // 查询总数
  const countResult = await appQuery<{ count: string }>(
    `SELECT COUNT(*) as count FROM users WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].count, 10);
  
  // 查询列表
  queryParams.push(pageSize, offset);
  const listResult = await appQuery<User>(
    `SELECT * FROM users WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    queryParams
  );
  
  // 批量查询所有用户的角色（优化 N+1 查询）
  const userIds = listResult.rows.map(u => u.id);
  const allRolesResult = await appQuery<{ user_id: number; id: number; code: string; name: string }>(
    `SELECT ur.user_id, r.id, r.code, r.name
    FROM roles r
    JOIN user_roles ur ON r.id = ur.role_id
    WHERE ur.user_id = ANY($1)`,
    [userIds]
  );

  // 使用 Map 分组角色数据
  const rolesByUserId = new Map<number, { id: number; code: string; name: string }[]>();
  for (const row of allRolesResult.rows) {
    const userId = row.user_id;
    if (!rolesByUserId.has(userId)) {
      rolesByUserId.set(userId, []);
    }
    rolesByUserId.get(userId)!.push({ id: row.id, code: row.code, name: row.name });
  }

  // 组装结果
  const list: UserWithRoles[] = listResult.rows.map(user => ({
    ...user,
    roles: rolesByUserId.get(user.id) || [],
  }));
  
  return { list, total };
}

/**
 * 获取用户详情
 */
export async function getUserById(id: number): Promise<UserWithRoles | null> {
  const result = await appQuery<User>(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const user = result.rows[0];
  
  // 获取用户角色
  const rolesResult = await appQuery<{ id: number; code: string; name: string }>(
    `SELECT r.id, r.code, r.name
    FROM roles r
    JOIN user_roles ur ON r.id = ur.role_id
    WHERE ur.user_id = $1`,
    [user.id]
  );
  
  return {
    ...user,
    roles: rolesResult.rows,
  };
}

/**
 * 更新用户信息
 */
export async function updateUser(id: number, data: Partial<User>): Promise<User | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;
  
  const allowedFields = ['name', 'avatar', 'mobile', 'email', 'position'];
  
  for (const field of allowedFields) {
    if (data[field as keyof User] !== undefined) {
      fields.push(`${field} = $${paramIndex}`);
      values.push(data[field as keyof User]);
      paramIndex++;
    }
  }
  
  if (fields.length === 0) {
    return getUserById(id) as Promise<User | null>;
  }
  
  values.push(id);
  
  const result = await appQuery<User>(
    `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 更新用户状态
 */
export async function updateUserStatus(id: number, status: number): Promise<boolean> {
  const result = await appQuery(
    'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, id]
  );
  
  return (result.rowCount ?? 0) > 0;
}

/**
 * 分配用户角色
 */
export async function assignUserRoles(userId: number, roleIds: number[]): Promise<boolean> {
  const client = await getAppClient();
  
  try {
    await client.query('BEGIN');
    
    // 删除现有角色
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    
    // 添加新角色
    for (const roleId of roleIds) {
      await client.query(
        'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
        [userId, roleId]
      );
    }
    
    await client.query('COMMIT');
    
    // 清除用户权限缓存
    invalidateUserPermissionCache(userId);
    
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 获取用户登录日志
 */
export async function getUserLoginLogs(userId: number, page: number, pageSize: number): Promise<{ list: any[]; total: number }> {
  const offset = (page - 1) * pageSize;
  
  const countResult = await appQuery<{ count: string }>(
    'SELECT COUNT(*) as count FROM login_logs WHERE user_id = $1',
    [userId]
  );
  const total = parseInt(countResult.rows[0].count, 10);
  
  const listResult = await appQuery(
    `SELECT * FROM login_logs WHERE user_id = $1 ORDER BY login_at DESC LIMIT $2 OFFSET $3`,
    [userId, pageSize, offset]
  );
  
  return { list: listResult.rows, total };
}
