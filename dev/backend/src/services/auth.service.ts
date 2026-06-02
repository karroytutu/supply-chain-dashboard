/**
 * 认证服务 - 统一导出入口
 * 实际实现已拆分到 auth/ 子目录，此文件仅做 re-export 保持向后兼容
 * @module services/auth.service
 */

import { appQuery } from '../db/appPool';
import { generateToken, JwtPayload } from '../utils/jwt';
import {
  getUserInfoByAuthCode,
  getUserInfoByCode,
} from './dingtalk.service';

// Re-export from auth/ submodules
export type { LoginResult, UserInfo, RoleInfo } from './auth/auth-user.service';
export {
  createOrUpdateUser,
  getUserRolesAndPermissions,
  getCurrentUser,
  recordLoginLog,
} from './auth/auth-user.service';
export { devSwitchUser, devGetUsers, devLogin } from './auth/auth-dev.service';

import type { LoginResult, UserInfo } from './auth/auth-user.service';
import { createOrUpdateUser, getUserRolesAndPermissions, recordLoginLog } from './auth/auth-user.service';

/**
 * 钉钉免登
 */
export async function autoLogin(authCode: string, ipAddress?: string, userAgent?: string): Promise<LoginResult> {
  try {
    const dingtalkUser = await getUserInfoByAuthCode(authCode);
    const user = await createOrUpdateUser(dingtalkUser);

    if (!user.status || user.status !== 1) {
      await recordLoginLog(user.id, 'dingtalk_auto', ipAddress, userAgent, false, '账户已被禁用');
      return {
        success: false,
        message: '账户已被禁用，请联系管理员',
      };
    }

    const { roles, permissions } = await getUserRolesAndPermissions(user.id);

    await recordLoginLog(user.id, 'dingtalk_auto', ipAddress, userAgent, true);

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
      message: error.message || '钉钉免登失败',
    };
  }
}

/**
 * 扫码登录回调
 */
export async function qrcodeCallback(code: string, ipAddress?: string, userAgent?: string): Promise<LoginResult> {
  try {
    const dingtalkUser = await getUserInfoByCode(code);
    const user = await createOrUpdateUser(dingtalkUser);

    if (!user.status || user.status !== 1) {
      await recordLoginLog(user.id, 'qrcode', ipAddress, userAgent, false, '账户已被禁用');
      return {
        success: false,
        message: '账户已被禁用，请联系管理员',
      };
    }

    const { roles, permissions } = await getUserRolesAndPermissions(user.id);

    await recordLoginLog(user.id, 'qrcode', ipAddress, userAgent, true);

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
      message: error.message || '扫码登录失败',
    };
  }
}
