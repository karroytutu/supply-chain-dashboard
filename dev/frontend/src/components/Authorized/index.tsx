/**
 * 权限包装组件
 * 用于声明式权限控制，包裹需要权限的UI元素
 */
import React from 'react';
import { useModel } from 'umi';

// 权限检查配置
interface AuthorizedConfig {
  /** 权限编码，支持单个或数组 */
  permission?: string | string[];
  /** 角色编码，支持单个或数组 */
  role?: string | string[];
  /** 多权限/角色检查模式：any=任一满足, all=全部满足 */
  mode?: 'any' | 'all';
}

// 组件属性
interface AuthorizedProps {
  /** 权限检查配置 */
  config: AuthorizedConfig;
  /** 无权限时显示的替代内容 */
  fallback?: React.ReactNode;
  /** 子元素 */
  children: React.ReactNode;
}

/**
 * 权限包装组件
 * 
 * @example
 * // 单个权限检查
 * <Authorized config={{ permission: 'system:user:write' }}>
 *   <Button>编辑用户</Button>
 * </Authorized>
 * 
 * @example
 * // 多个权限检查（任一满足）
 * <Authorized config={{ permission: ['perm1', 'perm2'], mode: 'any' }}>
 *   <Button>操作</Button>
 * </Authorized>
 * 
 * @example
 * // 多个权限检查（全部满足）
 * <Authorized config={{ permission: ['perm1', 'perm2'], mode: 'all' }}>
 *   <Button>操作</Button>
 * </Authorized>
 * 
 * @example
 * // 角色检查
 * <Authorized config={{ role: 'admin' }}>
 *   <Button>管理员操作</Button>
 * </Authorized>
 * 
 * @example
 * // 无权限时显示替代内容
 * <Authorized config={{ permission: 'system:user:write' }} fallback={<span>无权限</span>}>
 *   <Button>编辑用户</Button>
 * </Authorized>
 */
const Authorized: React.FC<AuthorizedProps> = ({ config, fallback = null, children }) => {
  const { hasPermission, hasRole } = useModel('auth');
  const { permission, role, mode = 'any' } = config;

  // 检查权限
  const checkPermission = (): boolean => {
    if (!permission) return true;

    const permissions = Array.isArray(permission) ? permission : [permission];
    
    if (mode === 'all') {
      return permissions.every(p => hasPermission(p));
    }
    return permissions.some(p => hasPermission(p));
  };

  // 检查角色
  const checkRole = (): boolean => {
    if (!role) return true;

    const roles = Array.isArray(role) ? role : [role];
    
    if (mode === 'all') {
      return roles.every(r => hasRole(r));
    }
    return roles.some(r => hasRole(r));
  };

  // 同时配置了权限和角色时，需要同时满足
  const hasAccess = permission && role 
    ? checkPermission() && checkRole()
    : checkPermission() && checkRole();

  if (hasAccess) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};

export default Authorized;
