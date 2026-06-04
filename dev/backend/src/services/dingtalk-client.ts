/**
 * 钉钉服务 - HTTP 客户端与 Token 管理
 * @module services/dingtalk-client
 */
import { createLogger } from '../utils/logger';
const log = createLogger('Service');

import * as $OpenApi from '@alicloud/openapi-client';
import { oauth2_1_0 } from '@alicloud/dingtalk';
import * as https from 'https';
import { config } from '../config';
import { cache } from '../utils/cache';
import { getErrorMessage } from '../utils/errorUtils';

// AccessToken 缓存 Key（统一 MemoryCache）
const DINGTALK_TOKEN_CACHE_KEY = 'dingtalk:access-token';
/** 提前刷新时间（5分钟），在 token 实际过期前 5 分钟重新获取 */
const DINGTALK_TOKEN_REFRESH_AHEAD_MS = 5 * 60 * 1000;

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
  const cached = cache.get<string>(DINGTALK_TOKEN_CACHE_KEY);
  if (cached) return cached;

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

    const expireInMs = (result.body.expireIn || 7200) * 1000;
    const cacheTtl = Math.max(expireInMs - DINGTALK_TOKEN_REFRESH_AHEAD_MS, 60 * 1000);
    cache.set(DINGTALK_TOKEN_CACHE_KEY, result.body.accessToken, cacheTtl);

    log.info('获取AccessToken成功, 过期时间:', result.body.expireIn, '秒');
    return result.body.accessToken;
  } catch (error) {
    log.error('获取AccessToken失败:', getErrorMessage(error) || error);
    throw new Error('获取AccessToken失败', { cause: error });
  }
}

/**
 * 旧版 oapi 接口请求封装
 */
export async function oapiRequest(accessToken: string, path: string, body: object): Promise<any> {
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

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`钉钉API返回HTTP ${res.statusCode}: ${data}`));
            return;
          }
          resolve(result);
        } catch (_e) {
          reject(new Error('解析钉钉响应失败: ' + data));
        }
      });
    });

    req.on('error', e => reject(e));
    req.setTimeout(10000, () => {
      req.destroy(new Error('钉钉API请求超时'));
    });
    req.write(postData);
    req.end();
  });
}

/**
 * 新版 api.dingtalk.com (v1.0) 请求封装
 * 绕过 SDK 的 AK/SK 凭证检查，通过 HTTP Header 直接传递 user access token
 */
export async function apiRequest(
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

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            const errMsg = result?.message || result?.errorMsg || `HTTP ${res.statusCode}`;
            reject(new Error(`[DingTalk API] ${result?.code || res.statusCode}: ${errMsg}`));
            return;
          }
          resolve(result);
        } catch (_e) {
          reject(new Error('解析钉钉响应失败: ' + data));
        }
      });
    });

    req.on('error', e => reject(e));
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
 * 发送钉钉 HTTP 请求（旧版 oapi 消息推送接口）
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

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
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
        } catch (_e) {
          reject(new Error('解析钉钉响应失败: ' + data));
        }
      });
    });

    req.on('error', e => reject(e));
    req.setTimeout(10000, () => {
      req.destroy(new Error('钉钉API请求超时'));
    });
    req.write(postData);
    req.end();
  });
}

/**
 * 清除AccessToken缓存
 */
export function clearAccessTokenCache(): void {
  cache.invalidate(DINGTALK_TOKEN_CACHE_KEY);
}
