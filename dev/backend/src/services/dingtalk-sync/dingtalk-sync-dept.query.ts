/**
 * 钉钉部门查询模块
 * 负责从钉钉API获取部门数据及本地部门查询
 */

import * as https from 'https';
import { getAccessToken, RETRYABLE_ERROR_CODES } from '../dingtalk.service';
import { appQuery } from '../../db/appPool';
import type { DingtalkDeptInfo } from './dingtalk-sync.types';

/**
 * 钉钉 oapi 请求封装（同步模块专用）
 * 与 dingtalk.service.ts 中的 oapiRequest 逻辑一致
 */
async function oapiRequest(path: string, body: object): Promise<any> {
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

/** 请求间隔控制（200ms） */
let lastRequestTime = 0;
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
 * 递归获取钉钉部门树
 * 从指定父部门开始，获取所有子部门
 */
export async function fetchDingtalkDeptTree(parentDeptId: number = 1): Promise<DingtalkDeptInfo[]> {
  const departments: DingtalkDeptInfo[] = [];

  try {
    const result = await rateLimitedRequest(() =>
      oapiRequest('/topapi/v2/department/listsub', {
        dept_id: parentDeptId,
      })
    );

    if (result.errcode === 0 && result.result) {
      for (const dept of result.result) {
        departments.push({
          dept_id: dept.dept_id,
          name: dept.name,
          parent_id: dept.parent_id,
          auto_add_user: dept.auto_add_user,
        });

        // 递归获取子部门
        const childDepts = await fetchDingtalkDeptTree(dept.dept_id);
        departments.push(...childDepts);
      }
    }
  } catch (error: any) {
    console.error(`[DingtalkSync] 获取部门 ${parentDeptId} 子部门失败:`, error.message);
  }

  return departments;
}

/**
 * 获取钉钉部门详情
 */
export async function fetchDingtalkDeptDetail(deptId: number): Promise<DingtalkDeptInfo | null> {
  try {
    const result = await rateLimitedRequest(() =>
      oapiRequest('/topapi/v2/department/get', {
        dept_id: deptId,
      })
    );

    if (result.errcode === 0 && result.result) {
      return {
        dept_id: result.result.dept_id,
        name: result.result.name,
        parent_id: result.result.parent_id,
        auto_add_user: result.result.auto_add_user,
      };
    }
    return null;
  } catch (error: any) {
    console.error(`[DingtalkSync] 获取部门 ${deptId} 详情失败:`, error.message);
    return null;
  }
}

/**
 * 获取本地所有部门记录
 */
export async function getAllLocalDepts(): Promise<Map<string, { id: number; name: string; parent_id: string | null }>> {
  const result = await appQuery(
    'SELECT id, dingtalk_dept_id, name, parent_id FROM dingtalk_departments'
  );

  const map = new Map<string, { id: number; name: string; parent_id: string | null }>();
  for (const row of result.rows) {
    map.set(row.dingtalk_dept_id, {
      id: row.id,
      name: row.name,
      parent_id: row.parent_id,
    });
  }
  return map;
}

/**
 * 根据钉钉部门ID获取本地部门记录
 */
export async function getDeptByDingtalkId(dingtalkDeptId: string): Promise<{ id: number; name: string } | null> {
  const result = await appQuery(
    'SELECT id, name FROM dingtalk_departments WHERE dingtalk_dept_id = $1',
    [dingtalkDeptId]
  );
  return result.rows[0] || null;
}
