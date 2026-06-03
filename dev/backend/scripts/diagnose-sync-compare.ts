/**
 * 钉钉同步对比诊断
 * 分别模拟 syncUsers 和 incrementalSyncUsers 的部门遍历逻辑
 * 对比两者结果是否一致，并追踪 disableDepartedUsers 的判断
 */

import { getAccessToken } from '../src/services/dingtalk-client';
import { appQuery } from '../src/db/appPool';
import * as https from 'https';

async function oapiPost(accessToken: string, path: string, body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const sep = path.includes('?') ? '&' : '?';
    const options = {
      hostname: 'oapi.dingtalk.com',
      path: `${path}${sep}access_token=${encodeURIComponent(accessToken)}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c: string) => { data += c; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('超时')));
    req.write(postData);
    req.end();
  });
}

async function fetchUsersByDept(token: string, deptId: number): Promise<{ users: string[]; errcode: number; errmsg: string }> {
  const result = await oapiPost(token, '/topapi/v2/user/list', { dept_id: deptId, cursor: 0, size: 100 });
  if (result.errcode !== 0) {
    return { users: [], errcode: result.errcode, errmsg: result.errmsg || '' };
  }
  const users = (result.result?.list || []).map((u: any) => u.userid as string);
  return { users, errcode: 0, errmsg: '' };
}

async function main() {
  console.log('=== 钉钉同步对比诊断 ===\n');

  const token = await getAccessToken();
  console.log(`✅ AccessToken: ${token.substring(0, 20)}...\n`);

  // 1. 获取本地部门
  const deptResult = await appQuery('SELECT dingtalk_dept_id, name FROM dingtalk_departments ORDER BY dingtalk_dept_id');
  console.log(`📁 本地部门数: ${deptResult.rows.length}\n`);

  // 2. 逐部门获取用户
  const allUserIds = new Set<string>();
  const deptResults: Array<{ dept: string; id: number; users: number; errcode: number; errmsg: string }> = [];

  for (const dept of deptResult.rows) {
    const deptId = parseInt(dept.dingtalk_dept_id, 10);
    const { users, errcode, errmsg } = await fetchUsersByDept(token, deptId);
    deptResults.push({ dept: dept.name, id: deptId, users: users.length, errcode, errmsg });
    users.forEach(uid => allUserIds.add(uid));
    await new Promise(r => setTimeout(r, 200));
  }

  // 3. 输出每个部门结果
  console.log('--- 逐部门结果 ---');
  for (const r of deptResults) {
    const status = r.errcode === 0 ? '✅' : '❌';
    const detail = r.errcode === 0 ? `${r.users} 用户` : `errcode=${r.errcode}, errmsg=${r.errmsg}`;
    console.log(`${status} [${r.dept}] (id=${r.id}): ${detail}`);
  }

  // 4. 汇总
  console.log(`\n--- 汇总 ---`);
  console.log(`钉钉用户ID总数(去重): ${allUserIds.size}`);

  // 5. 模拟 disableDepartedUsers
  const activeUsers = await appQuery(
    `SELECT id, name, dingtalk_user_id FROM users
     WHERE status = 1 AND dingtalk_user_id IS NOT NULL AND dingtalk_user_id != 'dev_admin'`
  );
  console.log(`本地活跃钉钉用户数: ${activeUsers.rows.length}`);

  const toDisable: Array<{ id: number; name: string; dingtalk_user_id: string }> = [];
  for (const row of activeUsers.rows) {
    if (!allUserIds.has(row.dingtalk_user_id)) {
      toDisable.push(row);
    }
  }

  console.log(`\n--- 离职检测模拟 ---`);
  console.log(`待禁用: ${toDisable.length} 人`);
  if (toDisable.length > 0) {
    console.log(`待禁用用户详情:`);
    for (const u of toDisable) {
      console.log(`  ID=${u.id}, 姓名=${u.name}, dingtalk_id=${u.dingtalk_user_id}`);
      // 检查这个用户的 department_ids 是否在本地部门列表中
      const userInfo = await appQuery(
        `SELECT department_id, department_name, department_ids FROM users WHERE id = $1`,
        [u.id]
      );
      if (userInfo.rows.length > 0) {
        const r = userInfo.rows[0];
        console.log(`    主部门: ${r.department_name}(${r.department_id}), 所有部门IDs: ${r.department_ids}`);
      }
    }
  }

  // 6. 检查本地已禁用的用户
  const disabledUsers = await appQuery(
    `SELECT id, name, dingtalk_user_id, department_name, updated_at FROM users
     WHERE status = 0 AND dingtalk_user_id IS NOT NULL AND dingtalk_user_id != 'dev_admin'
     ORDER BY updated_at DESC`
  );
  console.log(`\n--- 当前已禁用用户 ---`);
  console.log(`已禁用: ${disabledUsers.rows.length} 人`);
  for (const u of disabledUsers.rows) {
    const inDingtalk = allUserIds.has(u.dingtalk_user_id);
    console.log(`  ID=${u.id}, 姓名=${u.name}, 部门=${u.department_name}, 钉钉API返回=${inDingtalk ? '✅是' : '❌否'}, 更新时间=${u.updated_at}`);
  }

  // 7. 检查所有用户的 dingtalk_user_id 格式
  const allUsers = await appQuery(
    `SELECT id, name, dingtalk_user_id, status FROM users
     WHERE dingtalk_user_id IS NOT NULL AND dingtalk_user_id != 'dev_admin'
     ORDER BY id`
  );
  console.log(`\n--- 所有用户的 dingtalk_user_id 格式 ---`);
  for (const u of allUsers.rows) {
    const inDingtalk = allUserIds.has(u.dingtalk_user_id);
    const idFormat = /^\d+$/.test(u.dingtalk_user_id) ? '纯数字' : /^[a-zA-Z0-9]+$/.test(u.dingtalk_user_id) ? '字母数字' : '其他';
    console.log(`  ID=${u.id}, ${u.name}, status=${u.status}, dingtalk_id=${u.dingtalk_user_id} (${idFormat}, ${u.dingtalk_user_id.length}位), API返回=${inDingtalk ? '✅' : '❌'}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('诊断异常:', err);
  process.exit(1);
});
