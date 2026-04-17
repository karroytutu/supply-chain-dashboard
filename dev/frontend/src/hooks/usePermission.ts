/**
 * 权限检查 Hook
 * 提供便捷的权限检查方法
 */
import { useCallback, useMemo } from 'react';
import type { UserInfo } from '@/services/api/auth';

// @ts-ignore - useModel 由 @umijs/plugins/dist/model 提供
import { useModel } from 'umi';

interface PermissionState {
  currentUser: UserInfo | null;
  permissions: string[];
  roles: string[];
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  hasAllRoles: (roles: string[]) => boolean;
  refresh: () => Promise<UserInfo | null>;
}

/**
 * 权限检查 Hook
 * 
 * @example
 * const { hasPermission, hasRole, currentUser } = usePermission();
 * 
 * if (hasPermission('system:user:write')) {
 *   // 执行操作
 * }
 */
export function usePermission(): PermissionState {
  // 从 umi model 获取用户信息
  const authModel = useModel('auth');
  const currentUser = authModel.currentUser;
  const fetchCurrentUser = authModel.fetchCurrentUser;

  // 提取权限列表
  const permissions = useMemo(() => {
    return currentUser?.permissions || [];
  }, [currentUser]);

  // 提取角色列表
  const roles = useMemo(() => {
    return currentUser?.roles?.map(r => r.code) || [];
  }, [currentUser]);

  // 检查单个权限
  const hasPermission = useCallback((permission: string): boolean => {
    return permissions.includes(permission);
  }, [permissions]);

  // 检查是否有任一权限
  const hasAnyPermission = useCallback((perms: string[]): boolean => {
    return perms.some(p => permissions.includes(p));
  }, [permissions]);

  // 检查是否有全部权限
  const hasAllPermissions = useCallback((perms: string[]): boolean => {
    return perms.every(p => permissions.includes(p));
  }, [permissions]);

  // 检查单个角色
  const hasRole = useCallback((role: string): boolean => {
    return roles.includes(role);
  }, [roles]);

  // 检查是否有任一角色
  const hasAnyRole = useCallback((rs: string[]): boolean => {
    return rs.some(r => roles.includes(r));
  }, [roles]);

  // 检查是否有全部角色
  const hasAllRoles = useCallback((rs: string[]): boolean => {
    return rs.every(r => roles.includes(r));
  }, [roles]);

  return {
    currentUser,
    permissions,
    roles,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    hasAnyRole,
    hasAllRoles,
    refresh: fetchCurrentUser,
  };
}

export default usePermission;
