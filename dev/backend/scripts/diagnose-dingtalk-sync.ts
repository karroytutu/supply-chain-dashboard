/**
 * 钉钉同步诊断脚本
 * 逐部门测试 /topapi/v2/user/list API，输出每个部门的 errcode/errmsg
 * 用法: npx ts-node scripts/diagnose-dingtalk-sync.ts
 */

import { getAccessToken } from '../src/services/dingtalk-client';
import { appQuery } from '../src/db/appPool';
import * as https from 'https';

async function oapiPost(accessToken: string, path: string, body: object): Promise<any> {
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
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('解析失败: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('超时')));
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('=== 钉钉同步诊断 ===\n');

  // 1. 获取 access token
  let token: string;
  try {
    token = await getAccessToken();
    console.log(`✅ AccessToken 获取成功: ${token.substring(0, 20)}...\n`);
  } catch (err: any) {
    console.error('❌ AccessToken 获取失败:', err.message);
    process.exit(1);
  }

  // 2. 获取本地部门列表
  const deptResult = await appQuery(
    'SELECT dingtalk_dept_id, name FROM dingtalk_departments ORDER BY name'
  );
  console.log(`📁 本地部门数: ${deptResult.rows.length}\n`);

  // 3. 逐部门测试获取用户
  let totalUsers = 0;
  let successDepts = 0;
  let failDepts = 0;

  for (const dept of deptResult.rows) {
    const deptId = parseInt(dept.dingtalk_dept_id, 10);
    try {
      const result = await oapiPost(token, '/topapi/v2/user/list', {
        dept_id: deptId,
        cursor: 0,
        size: 100,
      });

      if (result.errcode === 0) {
        const userCount = result.result?.list?.length || 0;
        totalUsers += userCount;
        successDepts++;
        console.log(`✅ 部门 [${dept.name}] (id=${deptId}): 成功, ${userCount} 个用户`);
      } else {
        failDepts++;
        console.log(`❌ 部门 [${dept.name}] (id=${deptId}): errcode=${result.errcode}, errmsg=${result.errmsg}`);
      }
    } catch (err: any) {
      failDepts++;
      console.log(`💥 部门 [${dept.name}] (id=${deptId}): 异常 - ${err.message}`);
    }

    // 请求间隔 200ms
    await new Promise(r => setTimeout(r, 200));
  }

  // 4. 汇总
  console.log(`\n=== 汇总 ===`);
  console.log(`部门总数: ${deptResult.rows.length}`);
  console.log(`成功: ${successDepts}, 失败: ${failDepts}`);
  console.log(`获取到的用户总数(含重复): ${totalUsers}`);

  // 5. 检查本地用户状态
  const userStats = await appQuery(
    `SELECT status, COUNT(*) as cnt FROM users WHERE dingtalk_user_id IS NOT NULL AND dingtalk_user_id != 'dev_admin' GROUP BY status`
  );
  console.log(`\n本地用户状态:`);
  for (const row of userStats.rows) {
    console.log(`  ${row.status === 1 ? '活跃' : '禁用'}: ${row.cnt} 人`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('诊断脚本异常:', err);
  process.exit(1);
});
