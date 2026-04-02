/**
 * 权限缓存管理服务
 * 提供统一的权限缓存失效机制，确保权限修改后能及时生效
 */

import { cache } from '../utils/cache';
import { appQuery } from '../db/appPool';

// 缓存键前缀
const CACHE_KEY_PREFIX = {
  USER_PERMISSIONS: 'user_permissions:',
  PERMISSION_TREE: 'permission_tree',
};

/**
 * 清除单个用户的权限缓存
 * @param userId 用户ID
 */
export function invalidateUserPermissionCache(userId: number): void {
  cache.invalidate(`${CACHE_KEY_PREFIX.USER_PERMISSIONS}${userId}`);
  console.log(`[PermissionCache] 已清除用户 ${userId} 的权限缓存`);
}

/**
 * 清除角色下所有用户的权限缓存
 * @param roleId 角色ID
 */
export async function invalidateRolePermissionCache(roleId: number): Promise<void> {
  try {
    // 查询拥有该角色的所有用户
    const result = await appQuery<{ user_id: number }>(
      'SELECT user_id FROM user_roles WHERE role_id = $1',
      [roleId]
    );

    const userIds = result.rows.map(row => row.user_id);

    // 清除每个用户的权限缓存
    for (const userId of userIds) {
      cache.invalidate(`${CACHE_KEY_PREFIX.USER_PERMISSIONS}${userId}`);
    }

    console.log(`[PermissionCache] 已清除角色 ${roleId} 下 ${userIds.length} 个用户的权限缓存`);
  } catch (error) {
    console.error('[PermissionCache] 清除角色权限缓存失败:', error);
  }
}

/**
 * 清除所有用户的权限缓存
 */
export function invalidateAllPermissionCache(): void {
  cache.invalidate(CACHE_KEY_PREFIX.USER_PERMISSIONS.replace(':', ''));
  console.log('[PermissionCache] 已清除所有用户的权限缓存');
}

/**
 * 清除权限树缓存
 */
export function invalidatePermissionTreeCache(): void {
  cache.invalidate(CACHE_KEY_PREFIX.PERMISSION_TREE);
  console.log('[PermissionCache] 已清除权限树缓存');
}

/**
 * 获取用户权限缓存
 * @param userId 用户ID
 * @returns 缓存的权限数据，不存在返回 null
 */
export function getUserPermissionCache(userId: number): { roles: string[]; permissions: string[] } | null {
  return cache.get<{ roles: string[]; permissions: string[] }>(
    `${CACHE_KEY_PREFIX.USER_PERMISSIONS}${userId}`
  );
}

/**
 * 设置用户权限缓存
 * @param userId 用户ID
 * @param data 权限数据
 * @param ttl 缓存有效期（毫秒），默认30秒
 */
export function setUserPermissionCache(
  userId: number,
  data: { roles: string[]; permissions: string[] },
  ttl: number = 30000
): void {
  cache.set(`${CACHE_KEY_PREFIX.USER_PERMISSIONS}${userId}`, data, ttl);
}

/**
 * 获取权限树缓存
 * @returns 缓存的权限树数据，不存在返回 null
 */
export function getPermissionTreeCache<T>(): T | null {
  return cache.get<T>(CACHE_KEY_PREFIX.PERMISSION_TREE);
}

/**
 * 设置权限树缓存
 * @param data 权限树数据
 * @param ttl 缓存有效期（毫秒），默认5分钟
 */
export function setPermissionTreeCache<T>(data: T, ttl: number = 5 * 60 * 1000): void {
  cache.set(CACHE_KEY_PREFIX.PERMISSION_TREE, data, ttl);
}
