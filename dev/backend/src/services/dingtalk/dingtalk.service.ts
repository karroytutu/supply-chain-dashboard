/**
 * 钉钉工作通知核心服务
 * 提供用户认证、消息发送、进度查询、撤回等功能
 */

import * as https from 'https';
import * as $OpenApi from '@alicloud/openapi-client';
import * as $Util from '@alicloud/tea-util';
import { contact_1_0, oauth2_1_0 } from '@alicloud/dingtalk';
import { config } from '../../config';
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
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgActionCard,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgActionCardBtnJsonList,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgOa,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaHead,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaBody,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaBodyForm,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaStatusBar,
  OapiMessageCorpconversationGetsendprogressRequest,
  OapiMessageCorpconversationGetsendprogressParams,
  OapiMessageCorpconversationGetsendresultRequest,
  OapiMessageCorpconversationGetsendresultParams,
  OapiMessageCorpconversationRecallRequest,
  OapiMessageCorpconversationRecallParams,
  OapiMessageCorpconversationStatus_barUpdateRequest,
  OapiMessageCorpconversationStatus_barUpdateParams,
} from '../../../dingtalk-oapi/client';
import {
  type DingtalkUserInfo,
  type DingtalkUserDetail,
  type SendMessageOptions,
  type SendResult,
  type SendProgress,
  type SendResultResponse,
  type SendResultDetail,
  type ActionCardContent,
  type OaContent,
  type MessageType,
  STATUS_BAR_COLORS,
} from './dingtalk.types';
import { createNotificationLog, updateNotificationLogStatus, getNotificationLogById } from './notification-log.service';

// ============================================
// AccessToken 缓存
// ============================================

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
 * 直接发送 HTTP 请求到钉钉 API（绕过 SDK 序列化 bug）
 */
async function sendDingtalkRequest(accessToken: string, body: object): Promise<{ errcode: number; errmsg: string; taskId?: number }> {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);

    const options = {
      hostname: 'oapi.dingtalk.com',
      path: '/topapi/message/corpconversation/asyncsend_v2?access_token=' + accessToken,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('解析响应失败: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

/**
 * 创建旧版 API 客户端
 */
export function createOapiClient(accessToken: string): OapiClient {
  const cfg = new OapiConfig({});
  cfg.session = accessToken;
  cfg.serverUrl = 'https://oapi.dingtalk.com';
  return new OapiClient(cfg);
}

// ============================================
// 用户认证接口
// ============================================

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
 */
export async function getUserInfoByCode(code: string): Promise<DingtalkUserInfo> {
  try {
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
 */
export async function getUserDetail(userId: string): Promise<DingtalkUserDetail | null> {
  try {
    console.log('getUserDetail called with userId:', userId, '- SDK模式下建议使用getUserInfoByAccessToken');
    return null;
  } catch (error: any) {
    console.error('获取用户详细信息失败:', error.message);
    return null;
  }
}

/**
 * 获取部门信息
 */
export async function getDepartmentInfo(deptId: number): Promise<{ name: string } | null> {
  console.log('getDepartmentInfo called with deptId:', deptId, '- SDK模式下暂不支持');
  return null;
}

/**
 * 清除AccessToken缓存
 */
export function clearAccessTokenCache(): void {
  accessTokenCache = null;
}

// ============================================
// 消息发送接口
// ============================================

/**
 * 构建 Markdown 消息
 */
function buildMarkdownMsg(title: string, content: string): OapiMessageCorpconversationAsyncsend_v2ParamsMsg {
  const msg = new OapiMessageCorpconversationAsyncsend_v2ParamsMsg({});
  msg.msgtype = 'markdown';
  msg.markdown = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgMarkdown({});
  msg.markdown.title = title;
  msg.markdown.text = content;
  return msg;
}

/**
 * 构建 ActionCard 消息
 */
function buildActionCardMsg(actionCard: ActionCardContent): OapiMessageCorpconversationAsyncsend_v2ParamsMsg {
  const msg = new OapiMessageCorpconversationAsyncsend_v2ParamsMsg({});
  msg.msgtype = 'action_card';  // 钉钉 API msgtype 使用下划线格式
  msg.actionCard = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgActionCard({});
  msg.actionCard.title = actionCard.title;
  msg.actionCard.markdown = actionCard.markdown;

  // 调试：打印构建的消息
  console.log('[Dingtalk] ActionCard 消息构建:', JSON.stringify({
    msgtype: msg.msgtype,
    actionCard: {
      title: msg.actionCard.title,
      markdown: msg.actionCard.markdown?.substring(0, 100) + '...',
      singleTitle: actionCard.singleTitle,
      singleUrl: actionCard.singleUrl,
    }
  }, null, 2));

  if (actionCard.singleUrl) {
    // 单按钮模式
    msg.actionCard.singleTitle = actionCard.singleTitle || '查看详情';
    msg.actionCard.singleUrl = actionCard.singleUrl;
  } else if (actionCard.btnJsonList && actionCard.btnJsonList.length > 0) {
    // 多按钮模式
    msg.actionCard.btnOrientation = actionCard.btnOrientation || '0';
    msg.actionCard.btnJsonList = actionCard.btnJsonList.map(btn => {
      const btnItem = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgActionCardBtnJsonList({});
      btnItem.title = btn.title;
      btnItem.actionUrl = btn.actionUrl;
      return btnItem;
    });
  }

  return msg;
}

/**
 * 构建 OA 消息
 */
function buildOaMsg(oa: OaContent): OapiMessageCorpconversationAsyncsend_v2ParamsMsg {
  const msg = new OapiMessageCorpconversationAsyncsend_v2ParamsMsg({});
  msg.msgtype = 'oa';
  msg.oa = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgOa({});
  msg.oa.messageUrl = oa.messageUrl;
  if (oa.pcMessageUrl) msg.oa.pcMessageUrl = oa.pcMessageUrl;

  // 头部
  if (oa.head) {
    msg.oa.head = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaHead({});
    msg.oa.head.text = oa.head.text;
    if (oa.head.bgcolor) msg.oa.head.bgcolor = oa.head.bgcolor;
  }

  // 主体
  if (oa.body) {
    msg.oa.body = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaBody({});
    if (oa.body.title) msg.oa.body.title = oa.body.title;
    if (oa.body.content) msg.oa.body.content = oa.body.content;
    if (oa.body.author) msg.oa.body.author = oa.body.author;
    if (oa.body.image) msg.oa.body.image = oa.body.image;
    if (oa.body.fileCount) msg.oa.body.fileCount = oa.body.fileCount;

    if (oa.body.form && oa.body.form.length > 0) {
      msg.oa.body.form = oa.body.form.map(item => {
        const formItem = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaBodyForm({});
        formItem.key = item.key;
        formItem.value = item.value;
        return formItem;
      });
    }
  }

  // 状态栏
  if (oa.statusBar) {
    msg.oa.statusBar = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaStatusBar({});
    msg.oa.statusBar.statusValue = oa.statusBar.statusValue;
    msg.oa.statusBar.statusBg = oa.statusBar.statusBg;
  }

  return msg;
}

/**
 * 发送钉钉工作通知（扩展版）
 * 支持多种消息类型：markdown / actionCard / oa
 * 
 * 注意：由于 TypeScript SDK 存在 bug（stringifyMapValue 会把嵌套对象转成 "[object Object]"），
 * 这里直接使用 HTTP JSON 请求发送消息。
 * 
 * @param userIdList 接收者的用户ID列表
 * @param title 消息标题
 * @param content 消息内容（Markdown格式，当msgType为actionCard或oa时可为空）
 * @param options 发送选项
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
    // 参考: https://open.dingtalk.com/document/orgapp-server/send-work-notification
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

      case 'oa':
        if (!options?.oa) {
          return { success: false, message: 'OA 内容为空' };
        }
        msg = {
          msgtype: 'oa',
          oa: options.oa,
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

    console.log('[Dingtalk] 发送消息:', JSON.stringify(requestBody, null, 2));

    // 直接发送 HTTP JSON 请求（绕过 SDK bug）
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
        content: msgType === 'markdown' ? content : JSON.stringify(options?.actionCard || options?.oa),
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
        content: msgType === 'markdown' ? content : JSON.stringify(options?.actionCard || options?.oa),
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

// ============================================
// 查询接口
// ============================================

/**
 * 查询消息发送进度
 * @param taskId 任务ID
 */
export async function getSendProgress(taskId: number): Promise<SendProgress> {
  try {
    const accessToken = await getAccessToken();
    const client = createOapiClient(accessToken);

    const request = new OapiMessageCorpconversationGetsendprogressRequest({});
    request.params = new OapiMessageCorpconversationGetsendprogressParams({
      agentId: Number(config.dingtalk.agentId),
      taskId: taskId,
    });

    const response = await client.oapiMessageCorpconversationGetsendprogress(request);

    if (response.body?.errcode === 0 && response.body?.progress) {
      const progress = response.body.progress;
      return {
        success: true,
        progress: progress.progress || 0,
        totalCount: progress.totalCount || 0,
        successCount: progress.successCount || 0,
        failedCount: progress.failedCount || 0,
      };
    }

    return {
      success: false,
      progress: 0,
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
    };
  } catch (error: any) {
    console.error('[Dingtalk] 查询发送进度失败:', error.message);
    return {
      success: false,
      progress: 0,
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
    };
  }
}

/**
 * 查询消息发送结果
 * @param taskId 任务ID
 */
export async function getSendResult(taskId: number): Promise<SendResultResponse> {
  try {
    const accessToken = await getAccessToken();
    const client = createOapiClient(accessToken);

    const request = new OapiMessageCorpconversationGetsendresultRequest({});
    request.params = new OapiMessageCorpconversationGetsendresultParams({
      agentId: Number(config.dingtalk.agentId),
      taskId: taskId,
    });

    const response = await client.oapiMessageCorpconversationGetsendresult(request);

    if (response.body?.errcode === 0 && response.body?.sendResult) {
      const sendResult = response.body.sendResult;
      const results: SendResultDetail[] = [];

      // 处理失败列表
      if (sendResult.forbiddenList) {
        for (const item of sendResult.forbiddenList) {
          results.push({
            userId: item.userid || '',
            status: 'failed',
            errorMsg: item.reason,
          });
        }
      }

      return { success: true, results };
    }

    return { success: false, results: [] };
  } catch (error: any) {
    console.error('[Dingtalk] 查询发送结果失败:', error.message);
    return { success: false, results: [] };
  }
}

/**
 * 撤回消息
 * @param taskId 任务ID
 */
export async function recallMessage(taskId: number): Promise<{ success: boolean; message: string }> {
  try {
    const accessToken = await getAccessToken();
    const client = createOapiClient(accessToken);

    const request = new OapiMessageCorpconversationRecallRequest({});
    request.params = new OapiMessageCorpconversationRecallParams({
      agentId: Number(config.dingtalk.agentId),
      msgTaskId: taskId,
    });

    const response = await client.oapiMessageCorpconversationRecall(request);

    if (response.body?.errcode === 0) {
      // 更新推送记录状态
      await updateNotificationLogStatus(undefined, 'recalled', taskId);

      return { success: true, message: '撤回成功' };
    }

    return { success: false, message: response.body?.errmsg || '撤回失败' };
  } catch (error: any) {
    console.error('[Dingtalk] 撤回消息失败:', error.message);
    return { success: false, message: error.message || '撤回异常' };
  }
}

/**
 * 更新消息状态栏（仅 OA 消息支持）
 * @param taskId 任务ID
 * @param statusValue 状态值
 * @param statusBg 状态栏背景色
 */
export async function updateStatusBar(
  taskId: number,
  statusValue: string,
  statusBg: string = STATUS_BAR_COLORS.INFO
): Promise<{ success: boolean; message: string }> {
  try {
    const accessToken = await getAccessToken();
    const client = createOapiClient(accessToken);

    const request = new OapiMessageCorpconversationStatus_barUpdateRequest({});
    request.params = new OapiMessageCorpconversationStatus_barUpdateParams({
      agentId: Number(config.dingtalk.agentId),
      msgTaskId: taskId,
      statusBar: {
        statusValue,
        statusBg,
      },
    });

    const response = await client.oapiMessageCorpconversationStatus_barUpdate(request);

    if (response.body?.errcode === 0) {
      return { success: true, message: '更新成功' };
    }

    return { success: false, message: response.body?.errmsg || '更新失败' };
  } catch (error: any) {
    console.error('[Dingtalk] 更新状态栏失败:', error.message);
    return { success: false, message: error.message || '更新异常' };
  }
}

// 重导出类型
export type { DingtalkUserInfo, DingtalkUserDetail, SendResult, SendProgress, SendResultResponse };
