import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader, JwtPayload } from '../utils/jwt';
import { appQuery } from '../db/appPool';
import { getUserRolesAndPermissions } from '../services/auth.service';
import {
  getUserPermissionCache,
  setUserPermissionCache,
} from '../services/permission-cache.service';

// 扩展Express Request类型
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * JWT认证中间件
 * 验证Token后从数据库/缓存获取最新权限
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    res.status(401).json({
      success: false,
      message: '未提供认证令牌',
    });
    return;
  }
  
  const payload = verifyToken(token);
  
  if (!payload) {
    res.status(401).json({
      success: false,
      message: '无效的认证令牌',
    });
    return;
  }
  
  // 检查用户状态是否正常
  try {
    const result = await appQuery<{ status: number }>(
      'SELECT status FROM users WHERE id = $1',
      [payload.userId]
    );
    
    if (result.rows.length === 0 || result.rows[0].status !== 1) {
      res.status(401).json({
        success: false,
        message: '用户已被禁用',
      });
      return;
    }
  } catch (error) {
    console.error('检查用户状态失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误',
    });
    return;
  }
  
  // 从缓存获取权限，缓存未命中则查询数据库
  try {
    let permissionData = getUserPermissionCache(payload.userId);
    
    if (!permissionData) {
      const { roles, permissions } = await getUserRolesAndPermissions(payload.userId);
      permissionData = {
        roles: roles.map(r => r.code),
        permissions,
      };
      // 缓存30秒
      setUserPermissionCache(payload.userId, permissionData, 30000);
    }
    
    // 挂载用户信息和权限到请求对象
    req.user = {
      ...payload,
      roles: permissionData.roles,
      permissions: permissionData.permissions,
    };
    
    next();
  } catch (error) {
    console.error('获取用户权限失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误',
    });
  }
}

/**
 * 可选认证中间件
 * 如果提供了Token则验证，没有Token也继续
 */
export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);
  
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  
  next();
}
