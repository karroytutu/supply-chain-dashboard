import * as $OpenApi from '@alicloud/openapi-client';
import * as $Util from '@alicloud/tea-util';
import { contact_1_0, oauth2_1_0 } from '@alicloud/dingtalk';
import { config } from '../config';
import {
  default as OapiClient,
  Config as OapiConfig,
  OapiV2UserGetuserinfoRequest,
  OapiV2UserGetuserinfoParams,
  OapiV2UserGetRequest,
  OapiV2UserGetParams,
  OapiMessageCorpconversationAsyncsend_v2Request,
  OapiMessageCorpconversationAsyncsend_v2Params,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsg,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgMarkdown,
} from '../../dingtalk-oapi/client';

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
 * 获取通讯录客户端配置
 */
function getContactConfig(): $OpenApi.Config {
  const cfg = new $OpenApi.Config({});
  cfg.protocol = 'https';
  cfg.regionId = 'central';
  return cfg;
}

/**
 * 获取企业内部应用的 access_token
 * 使用钉钉 SDK 获取访问凭证
 */
async function getAccessToken(): Promise<string> {
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
 * 创建旧版 API 客户端
 */
function createOapiClient(accessToken: string): OapiClient {
  const cfg = new OapiConfig({});
  cfg.session = accessToken;
  cfg.serverUrl = 'https://oapi.dingtalk.com';
  return new OapiClient(cfg);
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
    
    // 2. 使用旧版 SDK 调用接口
    const client = createOapiClient(accessToken);
    const request = new OapiV2UserGetuserinfoRequest({});
    request.params = new OapiV2UserGetuserinfoParams({ code: authCode });
    
    const response = await client.oapiV2UserGetuserinfo(request);
    
    if (response.body?.errcode !== 0) {
      throw new Error(response.body?.errmsg || '获取用户信息失败');
    }

    const userData = response.body?.result;
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
    throw new Error('获取用户信息失败: ' + (error.message || '未知错误'));
  }
}

/**
 * 通过 userId 获取用户详细信息
 * 使用旧版 SDK 调用 /topapi/v2/user/get 接口
 */
async function getUserDetailByUserId(userId: string, accessToken: string): Promise<any> {
  const client = createOapiClient(accessToken);
  const request = new OapiV2UserGetRequest({});
  request.params = new OapiV2UserGetParams({ userid: userId });
  
  const response = await client.oapiV2UserGet(request);
  
  if (response.body?.errcode !== 0) {
    throw new Error(response.body?.errmsg || '获取用户详情失败');
  }

  return response.body?.result;
}

/**
 * 通过临时授权码获取用户信息（扫码登录）
 * 适用于外部浏览器的扫码登录场景
 */
export async function getUserInfoByCode(code: string): Promise<DingtalkUserInfo> {
  try {
    // 1. 获取用户Token
    const oauth2Client = new oauth2_1_0.default(getOAuth2Config());
    
    const getUserTokenRequest = new oauth2_1_0.GetUserTokenRequest({
      clientId: config.dingtalk.appKey,
      clientSecret: config.dingtalk.appSecret,
      code: code,
      refreshToken: '',
      grantType: 'authorization_code',
    });

    const tokenResult = await oauth2Client.getUserToken(getUserTokenRequest);
    
    if (!tokenResult.body?.accessToken) {
      throw new Error('获取AccessToken失败');
    }

    // 2. 使用accessToken获取用户信息
    const userInfo = await getUserInfoByAccessToken(tokenResult.body.accessToken);
    
    return userInfo;
  } catch (error: any) {
    console.error('通过code获取用户信息失败:', error.message || error);
    throw new Error('获取用户信息失败');
  }
}

/**
 * 通过accessToken获取用户信息
 */
async function getUserInfoByAccessToken(accessToken: string): Promise<DingtalkUserInfo> {
  const contactClient = new contact_1_0.default(getContactConfig());
  
  const getUserHeader = new contact_1_0.GetUserHeaders();
  getUserHeader.xAcsDingtalkAccessToken = accessToken;
  
  const userResult = await contactClient.getUserWithOptions('me', getUserHeader, new $Util.RuntimeOptions());
  
  if (!userResult.body) {
    throw new Error('获取用户信息为空');
  }

  return {
    userid: userResult.body.openId || userResult.body.unionId || '',
    unionid: userResult.body.unionId || '',
    name: userResult.body.nick || userResult.body.name || '',
    avatar: userResult.body.avatarUrl || userResult.body.avatar || '',
    mobile: userResult.body.mobile || '',
    email: userResult.body.email || '',
    department_id: userResult.body.deptId ? [userResult.body.deptId.toString()] : [],
    title: userResult.body.title || '',
  };
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
 * @param userIdList 接收者的用户ID列表
 * @param title 消息标题
 * @param content 消息内容（支持Markdown格式）
 * @returns 发送结果
 */
export async function sendWorkNotification(
  userIdList: string[],
  title: string,
  content: string
): Promise<{ success: boolean; message: string }> {
  try {
    if (!userIdList || userIdList.length === 0) {
      console.log('[Dingtalk] 工作通知跳过: 接收者列表为空');
      return { success: false, message: '接收者列表为空' };
    }

    const accessToken = await getAccessToken();
    const client = createOapiClient(accessToken);
    
    // 构建消息
    const msg = new OapiMessageCorpconversationAsyncsend_v2ParamsMsg({});
    msg.msgtype = 'markdown';
    msg.markdown = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgMarkdown({});
    msg.markdown.title = title;
    msg.markdown.text = content;
    
    // 构建请求
    const request = new OapiMessageCorpconversationAsyncsend_v2Request({});
    request.params = new OapiMessageCorpconversationAsyncsend_v2Params({});
    request.params.agentId = Number(config.dingtalk.agentId);
    request.params.useridList = userIdList;
    request.params.msg = msg;
    
    const response = await client.oapiMessageCorpconversationAsyncsend_v2(request);

    if (response.body && response.body.errcode === 0) {
      console.log('[Dingtalk] 工作通知发送成功:', {
        taskId: response.body.taskId,
        receivers: userIdList.length,
      });
      return { success: true, message: '发送成功' };
    } else {
      console.error('[Dingtalk] 工作通知发送失败:', response.body);
      return {
        success: false,
        message: response.body?.errmsg || '发送失败',
      };
    }
  } catch (error: any) {
    console.error('[Dingtalk] 工作通知发送异常:', error.message);
    return {
      success: false,
      message: error.message || '发送异常',
    };
  }
}
