/**
 * 钉钉服务 - 用户操作
 * @module services/dingtalk-user.service
 */
import { createLogger } from '../utils/logger';
const log = createLogger('Service');

import { config } from '../config';
import { oapiRequest, apiRequest, getAccessToken } from './dingtalk-client';
import type { DingtalkUserInfo, DingtalkUserDetail } from './dingtalk-types';
import { getErrorMessage } from '../utils/errorUtils';

/**
 * 通过免登授权码获取用户信息（H5微应用免登）
 * 使用旧版 SDK 调用 /topapi/v2/user/getuserinfo 接口
 */
export async function getUserInfoByAuthCode(authCode: string): Promise<DingtalkUserInfo> {
  try {
    log.info('开始H5微应用免登, authCode:', authCode.substring(0, 10) + '...');

    const accessToken = await getAccessToken();
    log.info('获取到AccessToken');

    const userinfoResult = await oapiRequest(accessToken, '/topapi/v2/user/getuserinfo', {
      code: authCode,
    });

    if (userinfoResult.errcode !== 0) {
      throw new Error(userinfoResult.errmsg || '获取用户信息失败');
    }

    const userData = userinfoResult.result;
    if (!userData) {
      throw new Error('用户信息为空');
    }

    let userDetails = null;
    try {
      userDetails = await getUserDetailByUserId(userData.userid!, accessToken);
    } catch (e) {
      log.warn('获取用户详细信息失败，使用基本信息:', e);
    }

    return {
      userid: userData.userid || '',
      unionid: userData.unionid || '',
      name: userData.name || userDetails?.name || '',
      avatar: userDetails?.avatar || '',
      mobile: userDetails?.mobile || '',
      email: userDetails?.email || '',
      department_id: userDetails?.dept_id_list?.map(String) || [],
      title: userDetails?.title || '',
    };
  } catch (error: any) {
    log.error('通过authCode获取用户信息失败:', error);
    error.message = '获取用户信息失败: ' + (error.message || '未知错误');
    throw error;
  }
}

/**
 * 通过 userId 获取用户详细信息
 */
async function getUserDetailByUserId(userId: string, accessToken: string): Promise<any> {
  const result = await oapiRequest(accessToken, '/topapi/v2/user/get', { userid: userId });

  if (result.errcode !== 0) {
    throw new Error(result.errmsg || '获取用户详情失败');
  }

  return result.result;
}

/**
 * 通过临时授权码获取用户信息（扫码登录）
 */
export async function getUserInfoByCode(code: string): Promise<DingtalkUserInfo> {
  try {
    const tokenResult = await apiRequest('POST', '/v1.0/oauth2/userAccessToken', {
      clientId: config.dingtalk.appKey,
      clientSecret: config.dingtalk.appSecret,
      code,
      grantType: 'authorization_code',
    });

    if (!tokenResult.accessToken) {
      throw new Error(`OAuth2 token交换失败: ${JSON.stringify(tokenResult)}`);
    }

    const userInfo = await getUserInfoByAccessToken(tokenResult.accessToken);
    return userInfo;
  } catch (error: any) {
    log.error('通过code获取用户信息失败:', error);
    error.message = '获取用户信息失败: ' + (error.message || '未知错误');
    throw error;
  }
}

/**
 * 通过accessToken获取用户信息
 */
async function getUserInfoByAccessToken(accessToken: string): Promise<DingtalkUserInfo> {
  try {
    const userResult = await apiRequest('GET', '/v1.0/contact/users/me', null, {
      'x-acs-dingtalk-access-token': accessToken,
    });

    if (!userResult) {
      throw new Error('获取用户信息为空');
    }

    return {
      userid: userResult.openId || userResult.unionId || '',
      unionid: userResult.unionId || '',
      name: userResult.nick || userResult.name || '',
      avatar: userResult.avatarUrl || userResult.avatar || '',
      mobile: userResult.mobile || '',
      email: userResult.email || '',
      department_id: userResult.deptId ? [userResult.deptId.toString()] : [],
      title: userResult.title || '',
    };
  } catch (error) {
    log.error('通过accessToken获取用户信息失败:', getErrorMessage(error) || error);
    throw error;
  }
}

/**
 * 获取用户详细信息
 * SDK模式下建议使用 getUserInfoByAccessToken 的结果
 */
export async function getUserDetail(userId: string): Promise<DingtalkUserDetail | null> {
  try {
    log.info(
      'getUserDetail called with userId:',
      userId,
      '- SDK模式下建议使用getUserInfoByAccessToken'
    );
    return null;
  } catch (error) {
    log.error('获取用户详细信息失败:', getErrorMessage(error));
    return null;
  }
}

/**
 * 获取部门信息
 */
export async function getDepartmentInfo(deptId: number): Promise<{ name: string } | null> {
  log.info('getDepartmentInfo called with deptId:', deptId, '- SDK模式下暂不支持');
  return null;
}
