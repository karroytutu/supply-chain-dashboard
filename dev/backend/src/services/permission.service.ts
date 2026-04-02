import { appQuery } from '../db/appPool';
import {
  getPermissionTreeCache,
  setPermissionTreeCache,
  invalidatePermissionTreeCache,
} from './permission-cache.service';

export interface Permission {
  id: number;
  code: string;
  name: string;
  resource_type: string;
  resource_key: string;
  action: string;
  parent_id: number | null;
  sort_order: number;
  created_at: Date;
}

export interface PermissionTreeNode extends Permission {
  children: PermissionTreeNode[];
}

/**
 * 获取所有权限
 */
export async function getAllPermissions(): Promise<Permission[]> {
  const result = await appQuery<Permission>(
    'SELECT * FROM permissions ORDER BY sort_order ASC, id ASC'
  );
  return result.rows;
}

/**
 * 获取权限树（带缓存）
 */
export async function getPermissionTree(): Promise<PermissionTreeNode[]> {
  // 尝试从缓存获取
  const cached = getPermissionTreeCache<PermissionTreeNode[]>();
  if (cached) {
    return cached;
  }
  
  const permissions = await getAllPermissions();
  
  // 构建树形结构
  const buildTree = (parentId: number | null): PermissionTreeNode[] => {
    return permissions
      .filter(p => p.parent_id === parentId)
      .map(p => ({
        ...p,
        children: buildTree(p.id),
      }));
  };
  
  const tree = buildTree(null);
  
  // 缓存5分钟
  setPermissionTreeCache(tree, 5 * 60 * 1000);
  
  return tree;
}

/**
 * 获取权限详情
 */
export async function getPermissionById(id: number): Promise<Permission | null> {
  const result = await appQuery<Permission>(
    'SELECT * FROM permissions WHERE id = $1',
    [id]
  );
  
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 创建权限
 */
export async function createPermission(data: {
  code: string;
  name: string;
  resource_type: string;
  resource_key: string;
  action: string;
  parent_id?: number;
  sort_order?: number;
}): Promise<Permission> {
  const result = await appQuery<Permission>(
    `INSERT INTO permissions (code, name, resource_type, resource_key, action, parent_id, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.code, data.name, data.resource_type, data.resource_key, data.action, data.parent_id || null, data.sort_order || 0]
  );
  
  // 清除权限树缓存
  invalidatePermissionTreeCache();
  
  return result.rows[0];
}

/**
 * 更新权限
 */
export async function updatePermission(id: number, data: Partial<Permission>): Promise<Permission | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;
  
  const allowedFields = ['name', 'resource_type', 'resource_key', 'action', 'parent_id', 'sort_order'];
  
  for (const field of allowedFields) {
    if (data[field as keyof Permission] !== undefined) {
      fields.push(`${field} = $${paramIndex}`);
      values.push(data[field as keyof Permission]);
      paramIndex++;
    }
  }
  
  if (fields.length === 0) {
    return getPermissionById(id);
  }
  
  values.push(id);
  
  const result = await appQuery<Permission>(
    `UPDATE permissions SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  
  // 清除权限树缓存
  invalidatePermissionTreeCache();
  
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 删除权限
 * 检查是否被角色使用，若有则返回使用的角色列表
 */
export async function deletePermission(id: number): Promise<boolean> {
  // 检查是否有子权限
  const childrenResult = await appQuery(
    'SELECT COUNT(*) as count FROM permissions WHERE parent_id = $1',
    [id]
  );
  
  if (parseInt(childrenResult.rows[0].count, 10) > 0) {
    throw new Error('存在子权限，无法删除');
  }
  
  // 检查是否被角色使用
  const rolesResult = await appQuery<{ role_name: string }>(
    `SELECT DISTINCT r.name as role_name
    FROM roles r
    JOIN role_permissions rp ON r.id = rp.role_id
    WHERE rp.permission_id = $1`,
    [id]
  );
  
  if (rolesResult.rows.length > 0) {
    const roleNames = rolesResult.rows.map(r => r.role_name).join('、');
    throw new Error(`该权限已被以下角色使用，无法删除: ${roleNames}`);
  }
  
  // 删除权限
  const result = await appQuery(
    'DELETE FROM permissions WHERE id = $1',
    [id]
  );
  
  // 清除权限树缓存
  invalidatePermissionTreeCache();
  
  return (result.rowCount ?? 0) > 0;
}
