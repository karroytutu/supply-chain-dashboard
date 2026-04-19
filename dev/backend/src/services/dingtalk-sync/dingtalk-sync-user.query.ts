/**
 * 钉钉用户查询模块
 * 负责从钉钉API获取用户数据、本地用户查询及限流控制
 */

import * as https from 'https';
import * as crypto from 'crypto';
import { getAccessToken, RETRYABLE_ERROR_CODES } from '../dingtalk.service';
import { appQuery } from '../../db/appPool';
import type { DingtalkSyncUserInfo, DingtalkUserListItem } from './dingtalk-sync.types';

/** 请求间隔控制 */
let lastRequestTime = 0;

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 钉钉 oapi GET 请求封装
 */
async function oapiGet(path: string): Promise<any> {
  const accessToken = await getAccessToken();
  return new Promise((resolve, reject) => {
    const separator = path.includes('?') ? '&' : '?';
    const options = {
      hostname: 'oapi.dingtalk.com',
      path: `${path}${separator}access_token=${encodeURIComponent(accessToken)}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
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
    req.end();
  });
}

/**
 * 钉钉 oapi POST 请求封装
 */
async function oapiPost(path: string, body: object): Promise<any> {
  const accessToken = await getAccessToken();
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
 * 限流请求：确保请求间隔至少200ms
 * 遇到限流错误码时自动重试（指数退避）
 */
async function rateLimitedRequest(
  requestFn: () => Promise<any>,
  maxRetries: number = 3
): Promise<any> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 200) {
    await delay(200 - elapsed);
  }

  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      lastRequestTime = Date.now();
      const result = await requestFn();

      if (result.errcode !== 0 && RETRYABLE_ERROR_CODES.includes(result.errcode)) {
        throw new Error(`钉钉限流错误: ${result.errcode} ${result.errmsg}`);
      }

      return result;
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 30000);
        console.warn(`[DingtalkSync] 请求失败，${backoff}ms 后重试 (${attempt + 1}/${maxRetries}):`, error.message);
        await delay(backoff);
      }
    }
  }
  throw lastError;
}

/**
 * 获取指定部门的用户列表（分页）
 * 返回用户基本信息：userid, name
 */
export async function fetchDingtalkUsersByDept(deptId: number): Promise<DingtalkUserListItem[]> {
  const allUsers: DingtalkUserListItem[] = [];
  let cursor = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await rateLimitedRequest(() =>
      oapiPost('/topapi/v2/user/list', {
        dept_id: deptId,
        cursor,
        size: 100,
      })
    );

    if (result.errcode !== 0) {
      console.error(`[DingtalkSync] 获取部门 ${deptId} 用户失败: ${result.errmsg}`);
      break;
    }

    const users = result.result?.list || [];
    for (const user of users) {
      allUsers.push({ userid: user.userid, name: user.name });
    }

    hasMore = result.result?.hasMore || false;
    cursor = result.result?.nextCursor || 0;
    if (users.length === 0) break;
  }

  return allUsers;
}

/**
 * 获取钉钉用户详细信息
 * 返回完整用户数据：姓名、头像、手机号、邮箱、部门列表、职位
 */
export async function fetchDingtalkUserDetail(userId: string): Promise<DingtalkSyncUserInfo | null> {
  try {
    const result = await rateLimitedRequest(() =>
      oapiGet(`/topapi/v2/user/get?userid=${encodeURIComponent(userId)}`)
    );

    if (result.errcode !== 0 || !result.result) {
      console.warn(`[DingtalkSync] 获取用户 ${userId} 详情失败: ${result.errmsg}`);
      return null;
    }

    const r = result.result;
    return {
      userid: r.userid || '',
      unionid: r.unionid || '',
      name: r.name || '',
      avatar: r.avatar || '',
      mobile: r.mobile || '',
      email: r.email || '',
      dept_id_list: r.dept_id_list || [],
      title: r.title || '',
    };
  } catch (error: any) {
    console.error(`[DingtalkSync] 获取用户 ${userId} 详情异常:`, error.message);
    return null;
  }
}

/**
 * 获取本地所有绑定了 dingtalk_user_id 的活跃用户
 * 返回 Map<dingtalk_user_id, 用户数据>
 */
export async function getAllLocalDingtalkUsers(): Promise<Map<string, {
  id: number;
  dingtalk_user_id: string;
  dingtalk_union_id: string;
  name: string;
  avatar: string;
  mobile: string;
  email: string;
  department_id: string;
  department_name: string;
  position: string;
  status: number;
  dingtalk_last_synced_at: string | null;
  dingtalk_sync_hash: string | null;
  department_ids: string | null;
}>> {
  const result = await appQuery(
    `SELECT id, dingtalk_user_id, dingtalk_union_id, name, avatar, mobile, email,
       department_id, department_name, position, status,
       dingtalk_last_synced_at, dingtalk_sync_hash, department_ids
     FROM users
     WHERE dingtalk_user_id IS NOT NULL
       AND dingtalk_user_id != 'dev_admin'`
  );

  const map = new Map();
  for (const row of result.rows) {
    map.set(row.dingtalk_user_id, row);
  }
  return map;
}

/**
 * 计算同步哈希值
 * 用于增量变更检测，字段变更时hash不同
 */
export function computeSyncHash(user: DingtalkSyncUserInfo): string {
  const raw = [
    user.name || '',
    user.mobile || '',
    user.email || '',
    user.avatar || '',
    user.title || '',
    (user.dept_id_list || []).sort().join(','),
  ].join('|');

  return crypto.createHash('md5').update(raw, 'utf8').digest('hex');
}
