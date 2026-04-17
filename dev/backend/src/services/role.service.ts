import { appQuery, getAppClient } from '../db/appPool';
import { invalidateRolePermissionCache, invalidateUserPermissionCache } from './permission-cache.service';

export interface Role {
  id: number;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  status: number;
  created_at: Date;
  updated_at: Date;
}

export interface RoleWithPermissions extends Role {
  permissions: { id: number; code: string; name: string }[];
}

export interface RoleListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: number;
}

export interface RoleListResult {
  list: RoleWithPermissions[];
  total: number;
}

/**
 * 获取角色列表
 */
export async function getRoleList(params: RoleListParams): Promise<RoleListResult> {
  const { page, pageSize, keyword, status } = params;
  const offset = (page - 1) * pageSize;
  
  let whereClause = '1=1';
  const queryParams: any[] = [];
  let paramIndex = 1;
  
  if (keyword) {
    whereClause += ` AND (name ILIKE $${paramIndex} OR code ILIKE $${paramIndex})`;
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
    `SELECT COUNT(*) as count FROM roles WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].count, 10);
  
  // 查询列表
  queryParams.push(pageSize, offset);
  const listResult = await appQuery<Role>(
    `SELECT * FROM roles WHERE ${whereClause} ORDER BY id ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    queryParams
  );
  
  // 批量查询所有角色的权限（优化 N+1 查询）
  const roleIds = listResult.rows.map(r => r.id);
  const allPermissionsResult = await appQuery<{ role_id: number; id: number; code: string; name: string }>(
    `SELECT rp.role_id, p.id, p.code, p.name
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = ANY($1)`,
    [roleIds]
  );

  // 使用 Map 分组权限数据
  const permissionsByRoleId = new Map<number, { id: number; code: string; name: string }[]>();
  for (const row of allPermissionsResult.rows) {
    const roleId = row.role_id;
    if (!permissionsByRoleId.has(roleId)) {
      permissionsByRoleId.set(roleId, []);
    }
    permissionsByRoleId.get(roleId)!.push({ id: row.id, code: row.code, name: row.name });
  }

  // 组装结果
  const list: RoleWithPermissions[] = listResult.rows.map(role => ({
    ...role,
    permissions: permissionsByRoleId.get(role.id) || [],
  }));
  
  return { list, total };
}

/**
 * 获取所有角色（用于下拉选择）
 */
export async function getAllRoles(): Promise<Role[]> {
  const result = await appQuery<Role>(
    'SELECT * FROM roles WHERE status = 1 ORDER BY id ASC'
  );
  return result.rows;
}

/**
 * 获取角色详情
 */
export async function getRoleById(id: number): Promise<RoleWithPermissions | null> {
  const result = await appQuery<Role>(
    'SELECT * FROM roles WHERE id = $1',
    [id]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const role = result.rows[0];
  
  // 获取角色权限
  const permissionsResult = await appQuery<{ id: number; code: string; name: string }>(
    `SELECT p.id, p.code, p.name
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = $1`,
    [role.id]
  );
  
  return {
    ...role,
    permissions: permissionsResult.rows,
  };
}

/**
 * 创建角色
 */
export async function createRole(data: { code: string; name: string; description?: string }): Promise<Role> {
  const result = await appQuery<Role>(
    `INSERT INTO roles (code, name, description) VALUES ($1, $2, $3) RETURNING *`,
    [data.code, data.name, data.description || '']
  );
  return result.rows[0];
}

/**
 * 更新角色
 * 系统角色只允许修改 description 字段
 */
export async function updateRole(id: number, data: Partial<Role>): Promise<Role | null> {
  // 检查是否为系统角色
  const roleCheck = await appQuery<{ is_system: boolean }>(
    'SELECT is_system FROM roles WHERE id = $1',
    [id]
  );
  
  if (roleCheck.rows.length === 0) {
    return null;
  }
  
  // 系统角色只允许修改 description
  const allowedFields = roleCheck.rows[0].is_system 
    ? ['description'] 
    : ['name', 'description'];
  
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;
  
  for (const field of allowedFields) {
    if (data[field as keyof Role] !== undefined) {
      fields.push(`${field} = $${paramIndex}`);
      values.push(data[field as keyof Role]);
      paramIndex++;
    }
  }
  
  if (fields.length === 0) {
    return getRoleById(id) as Promise<Role | null>;
  }
  
  values.push(id);
  
  const result = await appQuery<Role>(
    `UPDATE roles SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 删除角色
 */
export async function deleteRole(id: number): Promise<boolean> {
  // 检查是否为系统角色
  const role = await appQuery<Role>('SELECT is_system FROM roles WHERE id = $1', [id]);
  
  if (role.rows.length === 0) {
    return false;
  }
  
  if (role.rows[0].is_system) {
    throw new Error('系统角色不能删除');
  }
  
  const client = await getAppClient();
  
  try {
    await client.query('BEGIN');
    
    // 删除角色权限关联
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
    
    // 删除用户角色关联
    await client.query('DELETE FROM user_roles WHERE role_id = $1', [id]);
    
    // 删除角色
    await client.query('DELETE FROM roles WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    // 清除该角色下所有用户的权限缓存
    await invalidateRolePermissionCache(id);
    
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 分配角色权限
 * 包含权限ID验证和缓存失效
 */
export async function assignRolePermissions(roleId: number, permissionIds: number[]): Promise<boolean> {
  // 验证权限ID是否存在
  if (permissionIds.length > 0) {
    const validPermissionsResult = await appQuery<{ id: number }>(
      'SELECT id FROM permissions WHERE id = ANY($1)',
      [permissionIds]
    );
    
    const validIds = validPermissionsResult.rows.map(r => r.id);
    const invalidIds = permissionIds.filter(id => !validIds.includes(id));
    
    if (invalidIds.length > 0) {
      throw new Error(`以下权限ID不存在: ${invalidIds.join(', ')}`);
    }
  }
  
  const client = await getAppClient();
  
  try {
    await client.query('BEGIN');
    
    // 删除现有权限
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    
    // 批量添加新权限 - 使用动态构造 VALUES 子句
    if (permissionIds.length > 0) {
      const placeholders: string[] = [];
      const values: number[] = [];
      let paramIndex = 1;
      
      for (const permissionId of permissionIds) {
        placeholders.push(`($${paramIndex}, $${paramIndex + 1})`);
        values.push(roleId, permissionId);
        paramIndex += 2;
      }
      
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ${placeholders.join(', ')}`,
        values
      );
    }
    
    await client.query('COMMIT');
    
    // 清除该角色下所有用户的权限缓存
    await invalidateRolePermissionCache(roleId);
    
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
