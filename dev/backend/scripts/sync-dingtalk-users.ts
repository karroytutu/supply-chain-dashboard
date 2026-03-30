/**
 * 同步钉钉用户到系统用户表
 * 解决应收账款推送时营销师没有钉钉ID的问题
 */
import { appQuery, getAppClient } from '../src/db/appPool';
import axios from 'axios';
import { config } from '../src/config';

// AccessToken 缓存
let accessTokenCache: { token: string; expiresAt: number } | null = null;

/**
 * 获取企业内部应用的 access_token
 */
async function getAccessToken(): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
    return accessTokenCache.token;
  }

  const response = await axios.post(
    'https://api.dingtalk.com/v1.0/oauth2/accessToken',
    {
      appKey: config.dingtalk.appKey,
      appSecret: config.dingtalk.appSecret,
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (!response.data?.accessToken) {
    throw new Error('获取AccessToken失败: ' + JSON.stringify(response.data));
  }

  accessTokenCache = {
    token: response.data.accessToken,
    expiresAt: Date.now() + (response.data.expireIn || 7200) * 1000,
  };

  return response.data.accessToken;
}

/**
 * 递归获取所有子部门ID
 */
async function getAllDepartmentIds(accessToken: string, parentDeptId: number): Promise<number[]> {
  const deptIds: number[] = [parentDeptId];

  try {
    const response = await axios.post(
      'https://oapi.dingtalk.com/topapi/v2/department/listsub',
      { dept_id: parentDeptId },
      { params: { access_token: accessToken } }
    );

    if (response.data.errcode === 0 && response.data.result) {
      for (const dept of response.data.result) {
        // 递归获取子部门的子部门
        const childDeptIds = await getAllDepartmentIds(accessToken, dept.dept_id);
        deptIds.push(...childDeptIds);
      }
    }
  } catch (error: any) {
    console.log(`  获取部门 ${parentDeptId} 子部门失败: ${error.message}`);
  }

  return deptIds;
}

/**
 * 获取部门用户详情列表
 */
async function getDepartmentUsers(
  accessToken: string,
  deptId: number
): Promise<Array<{ userid: string; name: string; mobile?: string }>> {
  const allUsers: Array<{ userid: string; name: string; mobile?: string }> = [];
  let cursor = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      const response = await axios.post(
        'https://oapi.dingtalk.com/topapi/v2/user/list',
        { dept_id: deptId, cursor: cursor, size: 100 },
        { params: { access_token: accessToken } }
      );

      if (response.data.errcode !== 0) {
        console.log(`  获取部门 ${deptId} 用户失败: ${response.data.errmsg}`);
        break;
      }

      const users = response.data.result?.list || [];
      for (const user of users) {
        allUsers.push({
          userid: user.userid,
          name: user.name,
          mobile: user.mobile,
        });
      }

      hasMore = response.data.result?.hasMore || false;
      cursor = response.data.result?.nextCursor || 0;

      if (users.length === 0) break;
    }

    return allUsers;
  } catch (error: any) {
    console.log(`  获取部门 ${deptId} 用户异常: ${error.message}`);
    return allUsers;
  }
}

/**
 * 获取单个用户详情（用于补充手机号等信息）
 */
async function getUserDetail(
  accessToken: string,
  userId: string
): Promise<{ name: string; mobile: string } | null> {
  try {
    const response = await axios.get(
      'https://oapi.dingtalk.com/topapi/v2/user/get',
      { params: { access_token: accessToken, userid: userId } }
    );

    if (response.data.errcode !== 0) {
      return null;
    }

    return {
      name: response.data.result?.name || '',
      mobile: response.data.result?.mobile || '',
    };
  } catch {
    return null;
  }
}

async function syncDingtalkUsers() {
  try {
    console.log('=== 开始同步钉钉用户 ===\n');

    // 1. 查看应收账款中的营销师
    console.log('1. 应收账款中的营销师列表:');
    const managersResult = await appQuery(`
      SELECT DISTINCT manager_users
      FROM ar_receivables
      WHERE manager_users IS NOT NULL AND manager_users != ''
      ORDER BY manager_users
    `);
    console.log('营销师数量:', managersResult.rows.length);
    console.table(managersResult.rows.slice(0, 10));

    // 2. 查看现有用户
    console.log('\n2. 现有系统用户:');
    const usersResult = await appQuery('SELECT id, name, dingtalk_user_id, status FROM users');
    console.table(usersResult.rows);

    // 3. 获取钉钉用户
    console.log('\n3. 从钉钉获取用户...');
    const accessToken = await getAccessToken();
    console.log('AccessToken 获取成功');

    // 获取部门列表（递归获取所有子部门）
    console.log('正在获取部门列表...');
    const deptIds = await getAllDepartmentIds(accessToken, 1);
    console.log(`发现 ${deptIds.length} 个部门`);

    // 获取所有部门用户
    const dingtalkUsers: Map<string, { userid: string; name: string; mobile?: string }> = new Map();

    for (const deptId of deptIds) {
      console.log(`  正在获取部门 ${deptId} 的用户...`);
      const users = await getDepartmentUsers(accessToken, deptId);
      for (const user of users) {
        dingtalkUsers.set(user.name, user);
      }
    }

    console.log(`\n钉钉用户总数: ${dingtalkUsers.size}`);

    // 4. 匹配营销师与钉钉用户
    console.log('\n4. 匹配结果:');
    const matchedUsers: Array<{ manager_name: string; dingtalk_id: string }> = [];
    const unmatchedManagers: string[] = [];

    for (const row of managersResult.rows) {
      const managerName = row.manager_users.split(',')[0].trim();
      const dingtalkUser = dingtalkUsers.get(managerName);

      if (dingtalkUser) {
        matchedUsers.push({
          manager_name: managerName,
          dingtalk_id: dingtalkUser.userid,
        });
      } else {
        unmatchedManagers.push(managerName);
      }
    }

    console.log(`匹配成功: ${matchedUsers.length} 人`);
    console.log(`未匹配: ${unmatchedManagers.length} 人`);

    if (matchedUsers.length > 0) {
      console.log('\n匹配成功的用户:');
      console.table(matchedUsers);
    }

    if (unmatchedManagers.length > 0) {
      console.log('\n未匹配的营销师 (需要在钉钉中添加或名称不一致):');
      console.log(unmatchedManagers.join(', '));
    }

    // 5. 更新或创建用户
    console.log('\n5. 同步用户到数据库...');

    const client = await getAppClient();
    try {
      await client.query('BEGIN');

      for (const user of matchedUsers) {
        // 检查用户是否存在
        const existResult = await client.query(
          'SELECT id FROM users WHERE name = $1',
          [user.manager_name]
        );

        if (existResult.rows.length > 0) {
          // 更新钉钉ID
          await client.query(
            `UPDATE users
             SET dingtalk_user_id = $1, updated_at = NOW()
             WHERE name = $2`,
            [user.dingtalk_id, user.manager_name]
          );
          console.log(`  ✓ 更新用户: ${user.manager_name} -> ${user.dingtalk_id}`);
        } else {
          // 创建新用户
          const dingtalkDetail = await getUserDetail(accessToken, user.dingtalk_id);
          const mobile = dingtalkDetail?.mobile || '';

          await client.query(
            `INSERT INTO users (name, dingtalk_user_id, mobile, status, created_at, updated_at)
             VALUES ($1, $2, $3, 1, NOW(), NOW())`,
            [user.manager_name, user.dingtalk_id, mobile]
          );
          console.log(`  ✓ 创建用户: ${user.manager_name} -> ${user.dingtalk_id}`);
        }
      }

      await client.query('COMMIT');
      console.log('\n用户同步完成!');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // 6. 验证结果
    console.log('\n6. 同步后的用户列表:');
    const finalUsersResult = await appQuery(
      'SELECT id, name, dingtalk_user_id, mobile, status FROM users ORDER BY name'
    );
    console.table(finalUsersResult.rows);

    console.log('\n=== 同步完成 ===');

  } catch (error) {
    console.error('同步失败:', error);
  } finally {
    process.exit(0);
  }
}

syncDingtalkUsers();
