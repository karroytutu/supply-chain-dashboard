/**
 * 权限控制组件
 * 根据用户权限控制子组件的显示
 */
import React from 'react';
import { usePermission } from '@/hooks/usePermission';

export interface AuthorizedProps {
  /** 权限码，支持单个或多个 */
  permission?: string | string[];
  /** 角色码，支持单个或多个 */
  role?: string | string[];
  /** 多权限模式：'any' 满足任一即可，'all' 需全部满足 */
  mode?: 'any' | 'all';
  /** 无权限时显示的内容 */
  fallback?: React.ReactNode;
  /** 子组件 */
  children: React.ReactNode;
}

/**
 * 权限控制组件
 * 
 * @example
 * // 单个权限检查
 * <Authorized permission="system:user:write">
 *   <Button>编辑用户</Button>
 * </Authorized>
 * 
 * @example
 * // 多个权限检查（满足任一）
 * <Authorized permission={['system:user:write', 'system:role:write']}>
 *   <Button>操作</Button>
 * </Authorized>
 * 
 * @example
 * // 多个权限检查（需全部满足）
 * <Authorized permission={['perm1', 'perm2']} mode="all">
 *   <Button>操作</Button>
 * </Authorized>
 * 
 * @example
 * // 角色检查
 * <Authorized role="admin">
 *   <Button>管理员操作</Button>
 * </Authorized>
 * 
 * @example
 * // 无权限时显示替代内容
 * <Authorized permission="system:user:write" fallback={<span>无权限</span>}>
 *   <Button>编辑用户</Button>
 * </Authorized>
 */
export const Authorized: React.FC<AuthorizedProps> = ({
  permission,
  role,
  mode = 'any',
  fallback = null,
  children,
}) => {
  const { hasPermission, hasRole, hasAllPermissions, hasAnyPermission } = usePermission();

  // 权限检查
  if (permission) {
    const permissions = Array.isArray(permission) ? permission : [permission];
    const hasAuth = mode === 'all' 
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
    
    if (!hasAuth) {
      return <>{fallback}</>;
    }
  }

  // 角色检查
  if (role) {
    const roles = Array.isArray(role) ? role : [role];
    const hasAuth = mode === 'all'
      ? roles.every(r => hasRole(r))
      : roles.some(r => hasRole(r));
    
    if (!hasAuth) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
};

export default Authorized;
