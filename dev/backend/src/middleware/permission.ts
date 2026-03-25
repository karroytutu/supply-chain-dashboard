import { Request, Response, NextFunction } from 'express';

/**
 * 权限检查中间件
 * @param permission 需要的权限编码
 */
export function requirePermission(permission: string | string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }
    
    const permissions = req.user.permissions || [];
    const requiredPermissions = Array.isArray(permission) ? permission : [permission];
    
    // 检查是否拥有任一所需权限
    const hasPermission = requiredPermissions.some(p => permissions.includes(p));
    
    if (!hasPermission) {
      res.status(403).json({
        success: false,
        message: '无权限访问',
      });
      return;
    }
    
    next();
  };
}

/**
 * 角色检查中间件
 * @param role 需要的角色编码
 */
export function requireRole(role: string | string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }
    
    const roles = req.user.roles || [];
    const requiredRoles = Array.isArray(role) ? role : [role];
    
    // 检查是否拥有任一所需角色
    const hasRole = requiredRoles.some(r => roles.includes(r));
    
    if (!hasRole) {
      res.status(403).json({
        success: false,
        message: '无权限访问',
      });
      return;
    }
    
    next();
  };
}

/**
 * 管理员权限检查中间件
 */
export const requireAdmin = requireRole('admin');
