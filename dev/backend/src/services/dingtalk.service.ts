import * as $OpenApi from '@alicloud/openapi-client';
import { oauth2_1_0 } from '@alicloud/dingtalk';
import * as https from 'https';
import { config } from '../config';
import { createNotificationLog, updateNotificationLogStatus } from './notification-log.service';

export interface DingtalkUserInfo {
  userid: string;
  unionid: string;
  name: string;
  avatar?: string;
  mobile?: string;
  email?: string;
  department_id?: string[];
  title?: string;
}

export interface DingtalkUserDetail {
  userid: string;
  unionid: string;
  name: string;
  avatar: string;
  mobile: string;
  email: string;
  dept_id_list: number[];
  title: string;
}

// ============================================
// 工作通知消息类型定义
// ============================================

/** 消息类型 */
export type MessageType = 'markdown' | 'actionCard' | 'oa';

/** 业务类型 */
export type BusinessType = 'collection' | 'return_order' | 'return_penalty' | 'ar_assessment';

/** 推送记录状态 */
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'recalled';

/** 按钮配置 */
export interface ActionCardButton {
  title: string;
  actionUrl: string;
}

/** ActionCard 消息内容 */
export interface ActionCardContent {
  title: string;
  markdown: string;
  /** 按钮列表（最多2个） */
  btnJsonList?: ActionCardButton[];
  /** 单按钮模式URL（与btnJsonList二选一） */
  singleUrl?: string;
  /** 单按钮标题 */
  singleTitle?: string;
  /** 按钮排列方向：0-竖直，1-横向 */
  btnOrientation?: '0' | '1';
}

/** 发送消息选项 */
export interface SendMessageOptions {
  /** 消息类型 */
  msgType: MessageType;
  /** ActionCard 内容 */
  actionCard?: ActionCardContent;
  /** 业务类型 */
  businessType?: BusinessType;
  /** 业务ID */
  businessId?: number;
  /** 业务编号 */
  businessNo?: string;
  /** 创建者ID */
  createdBy?: number;
}

/** 发送结果 */
export interface SendResult {
  success: boolean;
  message: string;
  taskId?: number;
  logId?: number;
}

/** 重试配置 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
}

/** 可重试的错误码 */
export const RETRYABLE_ERROR_CODES = [60011, 60028, 50001, 50002, 50010];

/** 默认重试配置 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
};

/** 推送记录 */
export interface NotificationLog {
  id: number;
  businessType: BusinessType;
  businessId?: number;
  businessNo?: string;
  msgType: MessageType;
  title: string;
  content?: string;
  taskId?: number;
  receiverIds: string[];
  status: NotificationStatus;
  errorMessage?: string;
  retryCount: number;
  maxRetry: number;
  nextRetryAt?: Date;
  createdBy?: number;
  createdAt: Date;
  sentAt?: Date;
  updatedAt: Date;
}

/** 创建推送记录参数 */
export interface CreateNotificationLogParams {
  businessType: BusinessType;
  businessId?: number;
  businessNo?: string;
  msgType: MessageType;
  title: string;
  content?: string;
  taskId?: number;
  receiverIds: string[];
  createdBy?: number;
}

// AccessToken 缓存
let accessTokenCache: { token: string; expiresAt: number } | null = null;

/**
 * 获取OAuth2客户端配置
 */
function getOAuth2Config(): $OpenApi.Config {
  const cfg = new $OpenApi.Config({});
  cfg.protocol = 'https';
  cfg.regionId = 'central';
  return cfg;
}

/**
 * 获取企业内部应用的 access_token
 * 使用钉钉 SDK 获取访问凭证
 */
export async function getAccessToken(): Promise<string> {
  // 检查缓存是否有效（提前5分钟过期）
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
    return accessTokenCache.token;
  }

  try {
    const oauth2Client = new oauth2_1_0.default(getOAuth2Config());

    const request = new oauth2_1_0.GetAccessTokenRequest({
      appKey: config.dingtalk.appKey,
      appSecret: config.dingtalk.appSecret,
    });

    const result = await oauth2Client.getAccessToken(request);

    if (!result.body?.accessToken) {
      throw new Error('获取AccessToken失败: ' + JSON.stringify(result));
    }

    // 缓存 token
    accessTokenCache = {
      token: result.body.accessToken,
      expiresAt: Date.now() + (result.body.expireIn || 7200) * 1000,
    };

    console.log('[Dingtalk] 获取AccessToken成功, 过期时间:', result.body.expireIn, '秒');
    return result.body.accessToken;
  } catch (error: any) {
    console.error('[Dingtalk] 获取AccessToken失败:', error.message || error);
    throw new Error('获取AccessToken失败');
  }
}

/**
 * 通用钉钉旧版 API HTTP 请求封装
 * 替代原 dingtalk-oapi/client SDK，直接发送 HTTP 请求
 * 钉钉旧版 oapi 接口要求 access_token 作为 URL 查询参数传递
 */
async function oapiRequest(accessToken: string, path: string, body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const separator = path.includes('?') ? '&' : '?';
    const options = {
      hostname: 'oapi.dingtalk.com',
      path: `${path}${separator}access_token=${encodeURIComponent(accessToken)}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`钉钉API返回HTTP ${res.statusCode}: ${data}`));
            return;
          }
          resolve(result);
        } catch (e) {
          reject(new Error('解析钉钉响应失败: ' + data));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(10000, () => {
      req.destroy(new Error('钉钉API请求超时'));
    });
    req.write(postData);
    req.end();
  });
}

/**
 * 通用钉钉新版 API HTTP 请求封装
 * 针对 api.dingtalk.com（v1.0 新版 API），支持 GET/POST 方法和自定义请求头
 * 绕过 SDK 的 AK/SK 凭证检查，通过 HTTP Header 直接传递 user access token
 */
async function apiRequest(
  method: string,
  path: string,
  body: object | null,
  headers: Record<string, string> = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'api.dingtalk.com',
      path,
      method,
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            const errMsg = result?.message || result?.errorMsg || `HTTP ${res.statusCode}`;
            reject(new Error(`[DingTalk API] ${result?.code || res.statusCode}: ${errMsg}`));
            return;
          }
          resolve(result);
        } catch (e) {
          reject(new Error('解析钉钉响应失败: ' + data));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(10000, () => {
      req.destroy(new Error('钉钉API请求超时'));
    });

    if (body && method !== 'GET') {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * 通过免登授权码获取用户信息（H5微应用免登）
 * 使用旧版 SDK 调用 /topapi/v2/user/getuserinfo 接口
 */
export async function getUserInfoByAuthCode(authCode: string): Promise<DingtalkUserInfo> {
  try {
    console.log('[Dingtalk] 开始H5微应用免登, authCode:', authCode.substring(0, 10) + '...');
    
    // 1. 获取 access_token
    const accessToken = await getAccessToken();
    console.log('[Dingtalk] 获取到AccessToken');
    
    // 2. 使用旧版 API 获取用户信息
    const userinfoResult = await oapiRequest(accessToken, '/topapi/v2/user/getuserinfo', { code: authCode });

    if (userinfoResult.errcode !== 0) {
      throw new Error(userinfoResult.errmsg || '获取用户信息失败');
    }

    const userData = userinfoResult.result;
    if (!userData) {
      throw new Error('用户信息为空');
    }

    // 3. 获取用户详细信息（可选）
    let userDetails = null;
    try {
      userDetails = await getUserDetailByUserId(userData.userid!, accessToken);
    } catch (e) {
      console.warn('[Dingtalk] 获取用户详细信息失败，使用基本信息:', e);
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
    console.error('[Dingtalk] 通过authCode获取用户信息失败:', error.message || error);
    error.message = '获取用户信息失败: ' + (error.message || '未知错误');
    throw error;
  }
}

/**
 * 通过 userId 获取用户详细信息
 * 使用旧版 SDK 调用 /topapi/v2/user/get 接口
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
 * 适用于外部浏览器的扫码登录场景
 * 使用直接 HTTP 请求替代 SDK，绕过 AK/SK 凭证检查
 */
export async function getUserInfoByCode(code: string): Promise<DingtalkUserInfo> {
  try {
    // 1. 用 authCode 换取 userAccessToken
    // 官方文档参数：clientId, clientSecret, code, grantType（不传 refreshToken，不传 redirectUri）
    const tokenResult = await apiRequest('POST', '/v1.0/oauth2/userAccessToken', {
      clientId: config.dingtalk.appKey,
      clientSecret: config.dingtalk.appSecret,
      code,
      grantType: 'authorization_code',
    });

    if (!tokenResult.accessToken) {
      throw new Error(`OAuth2 token交换失败: ${JSON.stringify(tokenResult)}`);
    }

    // 2. 用 accessToken 获取用户信息
    const userInfo = await getUserInfoByAccessToken(tokenResult.accessToken);
    return userInfo;
  } catch (error: any) {
    console.error('[Dingtalk] 通过code获取用户信息失败:', error.message || error);
    error.message = '获取用户信息失败: ' + (error.message || '未知错误');
    throw error;
  }
}

/**
 * 通过accessToken获取用户信息
 * 使用直接 HTTP 请求替代 SDK，通过 Header 传递 user access token
 */
async function getUserInfoByAccessToken(accessToken: string): Promise<DingtalkUserInfo> {
  try {
    const userResult = await apiRequest(
      'GET',
      '/v1.0/contact/users/me',
      null,
      { 'x-acs-dingtalk-access-token': accessToken }
    );

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
  } catch (error: any) {
    console.error('[Dingtalk] 通过accessToken获取用户信息失败:', error.message || error);
    throw error;
  }
}

/**
 * 获取用户详细信息
 * 注意：使用SDK方式时，getUserInfoByAccessToken 已经返回了用户详细信息
 * 此方法保留用于需要通过userId查询用户详情的场景
 */
export async function getUserDetail(userId: string): Promise<DingtalkUserDetail | null> {
  try {
    // 使用SDK方式需要先获取accessToken，然后使用contact接口
    // 但getUserDetail通常需要企业内部应用的权限
    // 这里简化处理，返回null，让调用方使用getUserInfoByAccessToken的结果
    console.log('getUserDetail called with userId:', userId, '- SDK模式下建议使用getUserInfoByAccessToken');
    return null;
  } catch (error: any) {
    console.error('获取用户详细信息失败:', error.message);
    return null;
  }
}

/**
 * 获取部门信息
 * 注意：SDK方式需要额外权限，这里保留简化实现
 */
export async function getDepartmentInfo(deptId: number): Promise<{ name: string } | null> {
  // SDK方式需要企业通讯录权限，这里返回null
  // 部门名称可以在前端通过其他方式获取或留空
  console.log('getDepartmentInfo called with deptId:', deptId, '- SDK模式下暂不支持');
  return null;
}

/**
 * 清除AccessToken缓存（SDK模式不需要）
 */
export function clearAccessTokenCache(): void {
  // SDK模式不需要手动缓存
}

/**
 * 发送钉钉工作通知
 * 使用旧版 SDK 调用 asyncsend_v2 API 发送工作通知消息
 * 支持 markdown 和 actionCard 消息类型
 * @param userIdList 接收者的用户ID列表
 * @param title 消息标题
 * @param content 消息内容（支持Markdown格式）
 * @param options 发送选项（支持 ActionCard 等扩展消息类型）
 * @returns 发送结果
 */
export async function sendWorkNotification(
  userIdList: string[],
  title: string,
  content: string,
  options?: SendMessageOptions
): Promise<SendResult> {
  try {
    if (!userIdList || userIdList.length === 0) {
      console.log('[Dingtalk] 工作通知跳过: 接收者列表为空');
      return { success: false, message: '接收者列表为空' };
    }

    const msgType: MessageType = options?.msgType || 'markdown';
    const accessToken = await getAccessToken();

    // 构建消息体（根据官方文档格式）
    let msg: any;

    switch (msgType) {
      case 'actionCard':
        if (!options?.actionCard) {
          return { success: false, message: 'ActionCard 内容为空' };
        }
        msg = {
          msgtype: 'action_card',
          action_card: {
            title: options.actionCard.title,
            markdown: options.actionCard.markdown,
            single_title: options.actionCard.singleTitle || '查看详情',
            single_url: options.actionCard.singleUrl,
          },
        };
        break;

      case 'markdown':
      default:
        msg = {
          msgtype: 'markdown',
          markdown: {
            title: title,
            text: content,
          },
        };
        break;
    }

    // 构建请求体
    const requestBody = {
      agent_id: config.dingtalk.agentId,
      userid_list: userIdList.join(','),
      msg,
    };

    // 直接发送 HTTP JSON 请求
    const response = await sendDingtalkRequest(accessToken, requestBody);

    if (response.errcode === 0) {
      const taskId = response.taskId;
      console.log('[Dingtalk] 工作通知发送成功:', {
        taskId,
        msgType,
        receivers: userIdList.length,
      });

      // 保存推送记录
      const logId = await createNotificationLog({
        businessType: options?.businessType || 'collection',
        businessId: options?.businessId,
        businessNo: options?.businessNo,
        msgType,
        title,
        content: msgType === 'markdown' ? content : JSON.stringify(options?.actionCard),
        taskId,
        receiverIds: userIdList,
        createdBy: options?.createdBy,
      });

      // 更新为已发送
      await updateNotificationLogStatus(logId, 'sent', taskId);

      return { success: true, message: '发送成功', taskId, logId };
    } else {
      const errMsg = response.errmsg || '发送失败';
      console.error('[Dingtalk] 工作通知发送失败:', response);

      // 保存失败记录
      const logId = await createNotificationLog({
        businessType: options?.businessType || 'collection',
        businessId: options?.businessId,
        businessNo: options?.businessNo,
        msgType,
        title,
        content: msgType === 'markdown' ? content : JSON.stringify(options?.actionCard),
        receiverIds: userIdList,
        createdBy: options?.createdBy,
      });

      await updateNotificationLogStatus(logId, 'failed', undefined, errMsg);

      return { success: false, message: errMsg, logId };
    }
  } catch (error: any) {
    console.error('[Dingtalk] 工作通知发送异常:', error.message);
    return { success: false, message: error.message || '发送异常' };
  }
}

/**
 * 发送钉钉 HTTP 请求
 * 钉钉旧版 oapi 接口要求 access_token 作为 URL 查询参数传递
 */
export async function sendDingtalkRequest(
  accessToken: string,
  body: object
): Promise<{ errcode: number; errmsg: string; taskId?: number }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);

    const options = {
      hostname: 'oapi.dingtalk.com',
      path: `/topapi/message/corpconversation/asyncsend_v2?access_token=${encodeURIComponent(accessToken)}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`钉钉API返回HTTP ${res.statusCode}: ${data}`));
            return;
          }
          resolve({
            errcode: result.errcode ?? -1,
            errmsg: result.errmsg || '',
            taskId: result.task_id,
          });
        } catch (e) {
          reject(new Error('解析钉钉响应失败: ' + data));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(10000, () => {
      req.destroy(new Error('钉钉API请求超时'));
    });
    req.write(postData);
    req.end();
  });
}
