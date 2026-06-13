/**
 * 钉钉同步数据变更模块
 * 负责部门同步、用户同步的核心写入逻辑
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('DingtalkSync');

import { getAppClient } from '../../db/appPool';
import { invalidateUserPermissionCache } from '../permission-cache.service';
import { fetchDingtalkDeptTree, getAllLocalDepts } from './dingtalk-sync-dept.query';
import {
  fetchDingtalkUsersByDept,
  fetchDingtalkUserDetail,
  getAllLocalDingtalkUsers,
  computeSyncHash,
} from './dingtalk-sync-user.query';
import type { DingtalkSyncUserInfo, SyncStats, DeptSyncResult } from './dingtalk-sync.types';
import { getErrorMessage } from '../../utils/errorUtils';

/**
 * 全量部门同步
 * 获取钉钉部门树，与本地对比后批量插入/更新
 */
export async function syncDepartments(): Promise<DeptSyncResult> {
  log.info('开始同步部门...');

  // 1. 获取钉钉部门树
  const dingtalkDepts = await fetchDingtalkDeptTree(1);
  log.info(`钉钉部门总数: ${dingtalkDepts.length}`);

  // 2. 获取本地部门
  const localDepts = await getAllLocalDepts();
  log.info(`本地部门总数: ${localDepts.size}`);

  // 3. 计算需要创建和更新的部门
  let created = 0;
  let updated = 0;

  const client = await getAppClient();
  try {
    await client.query('BEGIN');

    for (const dept of dingtalkDepts) {
      const deptIdStr = dept.dept_id.toString();
      const localDept = localDepts.get(deptIdStr);

      if (!localDept) {
        // 新建部门
        await client.query(
          `INSERT INTO dingtalk_departments (dingtalk_dept_id, name, parent_id, auto_add_user)
           VALUES ($1, $2, $3, $4)`,
          [deptIdStr, dept.name, dept.parent_id?.toString() || null, dept.auto_add_user || false]
        );
        created++;
      } else if (
        localDept.name !== dept.name ||
        localDept.parent_id !== (dept.parent_id?.toString() || null)
      ) {
        // 更新部门（仅名称或父部门变更时）
        await client.query(
          `UPDATE dingtalk_departments SET name = $1, parent_id = $2 WHERE dingtalk_dept_id = $3`,
          [dept.name, dept.parent_id?.toString() || null, deptIdStr]
        );
        updated++;
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const result: DeptSyncResult = { created, updated, total: dingtalkDepts.length };
  log.info(`部门同步完成: 新建${created}, 更新${updated}, 总计${dingtalkDepts.length}`);
  return result;
}

/**
 * 全量用户同步
 * 遍历所有部门用户，获取详情并同步到本地
 */
export async function syncUsers(): Promise<SyncStats> {
  log.info('开始全量用户同步...');
  const stats: SyncStats = { created: 0, updated: 0, disabled: 0, unchanged: 0, errors: 0 }; // disabled 始终为 0，离职由 Stream 事件处理

  // 1. 先同步部门，确保部门数据是最新的
  await syncDepartments();

  // 2. 获取本地所有钉钉用户
  const localUsers = await getAllLocalDingtalkUsers();

  // 3. 获取本地所有部门（用于查找主部门名称）
  const localDepts = await getAllLocalDepts();

  // 4. 获取钉钉所有部门下的用户列表（去重）
  const allDingtalkUserIds = new Set<string>();
  const deptIds = Array.from(localDepts.keys());

  for (const deptIdStr of deptIds) {
    try {
      const deptUsers = await fetchDingtalkUsersByDept(parseInt(deptIdStr, 10));
      for (const user of deptUsers) {
        allDingtalkUserIds.add(user.userid);
      }
    } catch (error) {
      log.error(`获取部门 ${deptIdStr} 用户列表失败:`, getErrorMessage(error));
      stats.errors++;
    }
  }

  log.info(`钉钉用户ID总数: ${allDingtalkUserIds.size}`);

  // 5. 逐个获取用户详情并同步
  for (const userId of allDingtalkUserIds) {
    try {
      const userDetail = await fetchDingtalkUserDetail(userId);
      if (!userDetail) {
        stats.errors++;
        continue;
      }

      const localUser = localUsers.get(userId);
      const newHash = computeSyncHash(userDetail);

      if (!localUser) {
        // 新建用户
        await createNewUser(userDetail, newHash, localDepts);
        stats.created++;
      } else if (localUser.dingtalk_sync_hash !== newHash) {
        // 更新用户（hash 不一致）
        await updateExistingUser(localUser, userDetail, newHash, localDepts);
        stats.updated++;
      } else {
        // 未变更，仅更新同步时间
        await updateSyncTimestamp(localUser.id);
        stats.unchanged++;
      }
    } catch (error) {
      log.error(`同步用户 ${userId} 失败:`, getErrorMessage(error));
      stats.errors++;
    }
  }

  // 离职检测已由钉钉 Stream 事件驱动实时处理，定期同步不再执行

  log.info(`用户同步完成:`, stats);
  return stats;
}

/**
 * 按部门同步用户
 * 仅同步指定部门的用户，不处理离职
 */
export async function syncUsersByDept(deptId: string): Promise<SyncStats> {
  log.info(`开始按部门同步用户, deptId=${deptId}`);
  const stats: SyncStats = { created: 0, updated: 0, disabled: 0, unchanged: 0, errors: 0 }; // disabled 始终为 0，离职由 Stream 事件处理

  const localDepts = await getAllLocalDepts();
  const localUsers = await getAllLocalDingtalkUsers();

  // 获取该部门下的用户列表
  const deptUsers = await fetchDingtalkUsersByDept(parseInt(deptId, 10));
  log.info(`部门 ${deptId} 下用户数: ${deptUsers.length}`);

  for (const userItem of deptUsers) {
    try {
      const userDetail = await fetchDingtalkUserDetail(userItem.userid);
      if (!userDetail) {
        stats.errors++;
        continue;
      }

      const localUser = localUsers.get(userItem.userid);
      const newHash = computeSyncHash(userDetail);

      if (!localUser) {
        await createNewUser(userDetail, newHash, localDepts);
        stats.created++;
      } else if (localUser.dingtalk_sync_hash !== newHash) {
        await updateExistingUser(localUser, userDetail, newHash, localDepts);
        stats.updated++;
      } else {
        await updateSyncTimestamp(localUser.id);
        stats.unchanged++;
      }
    } catch (error) {
      log.error(`同步用户 ${userItem.userid} 失败:`, getErrorMessage(error));
      stats.errors++;
    }
  }

  log.info(`部门同步完成:`, stats);
  return stats;
}

/**
 * 增量用户同步
 * 仅处理可能发生变更的用户（hash缺失、超7天未同步）
 */
export async function incrementalSyncUsers(): Promise<SyncStats> {
  log.info('开始增量用户同步...');
  const stats: SyncStats = { created: 0, updated: 0, disabled: 0, unchanged: 0, errors: 0 }; // disabled 始终为 0，离职由 Stream 事件处理

  // 先同步部门
  await syncDepartments();

  const localDepts = await getAllLocalDepts();
  const localUsers = await getAllLocalDingtalkUsers();

  // 获取所有钉钉用户ID集合（用于增量同步遍历）
  const allDingtalkUserIds = new Set<string>();
  const deptIds = Array.from(localDepts.keys());

  for (const deptIdStr of deptIds) {
    try {
      const deptUsers = await fetchDingtalkUsersByDept(parseInt(deptIdStr, 10));
      for (const user of deptUsers) {
        allDingtalkUserIds.add(user.userid);
      }
    } catch (error) {
      log.error(`获取部门 ${deptIdStr} 用户列表失败:`, getErrorMessage(error));
    }
  }

  // 诊断日志：部门遍历结果汇总
  const activeLocalCount = Array.from(localUsers.values()).filter(u => u.status === 1).length;
  log.info(
    `部门遍历完成: 部门数=${deptIds.length}, 钉钉用户ID总数=${allDingtalkUserIds.size}, 本地活跃用户数=${activeLocalCount}`
  );

  // 增量模式：仅对需要更新的用户获取详情
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  for (const userId of allDingtalkUserIds) {
    try {
      const localUser = localUsers.get(userId);

      // 增量条件：新用户、hash缺失、超过7天未同步
      const needsDetail =
        !localUser ||
        !localUser.dingtalk_sync_hash ||
        (localUser.dingtalk_last_synced_at &&
          new Date(localUser.dingtalk_last_synced_at) < sevenDaysAgo);

      if (!needsDetail && localUser) {
        stats.unchanged++;
        continue;
      }

      const userDetail = await fetchDingtalkUserDetail(userId);
      if (!userDetail) {
        stats.errors++;
        continue;
      }

      const newHash = computeSyncHash(userDetail);

      if (!localUser) {
        await createNewUser(userDetail, newHash, localDepts);
        stats.created++;
      } else if (localUser.dingtalk_sync_hash !== newHash) {
        await updateExistingUser(localUser, userDetail, newHash, localDepts);
        stats.updated++;
      } else {
        await updateSyncTimestamp(localUser.id);
        stats.unchanged++;
      }
    } catch (error) {
      log.error(`增量同步用户 ${userId} 失败:`, getErrorMessage(error));
      stats.errors++;
    }
  }

  // 离职检测已由钉钉 Stream 事件驱动实时处理，定期同步不再执行

  log.info(`增量同步完成:`, stats);
  return stats;
}

/**
 * 创建新用户
 * 分配 viewer 默认角色，设置主部门和同步信息
 */
async function createNewUser(
  user: DingtalkSyncUserInfo,
  syncHash: string,
  localDepts: Map<string, { id: number; name: string; parent_id: string | null }>
): Promise<void> {
  const primaryDeptId = user.dept_id_list?.[0]?.toString() || '';
  const primaryDept = primaryDeptId ? localDepts.get(primaryDeptId) : null;
  const deptIdsStr = (user.dept_id_list || []).map(String).join(',');

  const client = await getAppClient();
  try {
    await client.query('BEGIN');

    // 创建用户
    const insertResult = await client.query(
      `INSERT INTO users (dingtalk_user_id, dingtalk_union_id, name, avatar, mobile, email,
         department_id, department_name, position, status, department_ids,
         dingtalk_sync_hash, dingtalk_last_synced_at, manager_userid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11, NOW(), $12)
       RETURNING id`,
      [
        user.userid,
        user.unionid,
        user.name,
        user.avatar || '',
        user.mobile || '',
        user.email || '',
        primaryDeptId,
        primaryDept?.name || '',
        user.title || '',
        deptIdsStr,
        syncHash,
        user.manager_userid || null,
      ]
    );

    const newUserId = insertResult.rows[0].id;

    // 分配 viewer 默认角色
    const viewerRole = await client.query('SELECT id FROM roles WHERE code = $1', ['viewer']);
    if (viewerRole.rows.length > 0) {
      await client.query(
        'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [newUserId, viewerRole.rows[0].id]
      );
    }

    // 创建用户-部门关联
    await syncUserDepartments(client, newUserId, user, localDepts);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 更新已有用户
 * 更新用户信息、部门关联，并刷新权限缓存
 */
async function updateExistingUser(
  localUser: {
    id: number;
    dingtalk_union_id: string;
  },
  user: DingtalkSyncUserInfo,
  syncHash: string,
  localDepts: Map<string, { id: number; name: string; parent_id: string | null }>
): Promise<void> {
  const primaryDeptId = user.dept_id_list?.[0]?.toString() || '';
  const primaryDept = primaryDeptId ? localDepts.get(primaryDeptId) : null;
  const deptIdsStr = (user.dept_id_list || []).map(String).join(',');

  const client = await getAppClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE users SET
        dingtalk_user_id = $1, dingtalk_union_id = $2,
        name = $3, avatar = $4, mobile = $5, email = $6,
        department_id = $7, department_name = $8, position = $9,
        department_ids = $10, dingtalk_sync_hash = $11,
        dingtalk_last_synced_at = NOW(), updated_at = NOW(),
        manager_userid = $13
      WHERE id = $12`,
      [
        user.userid,
        user.unionid,
        user.name,
        user.avatar || '',
        user.mobile || '',
        user.email || '',
        primaryDeptId,
        primaryDept?.name || '',
        user.title || '',
        deptIdsStr,
        syncHash,
        localUser.id,
        user.manager_userid || null,
      ]
    );

    // 更新用户-部门关联
    await syncUserDepartments(client, localUser.id, user, localDepts);

    await client.query('COMMIT');

    // 刷新权限缓存（状态可能影响权限）
    invalidateUserPermissionCache(localUser.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 同步用户-部门关联
 * 先删除旧关联，再插入新关联（含 is_leader 标记）
 */
async function syncUserDepartments(
  client: any,
  userId: number,
  user: DingtalkSyncUserInfo,
  localDepts: Map<string, { id: number; name: string; parent_id: string | null }>
): Promise<void> {
  // 构建 dept_id -> is_leader 映射
  const leaderMap = new Map<number, boolean>();
  if (user.leader_in_dept) {
    for (const item of user.leader_in_dept) {
      leaderMap.set(item.dept_id, item.leader);
    }
  }

  const deptIdList = user.dept_id_list || [];

  // 删除旧关联
  await client.query('DELETE FROM user_departments WHERE user_id = $1', [userId]);

  // 插入新关联
  for (let i = 0; i < deptIdList.length; i++) {
    const deptIdStr = deptIdList[i].toString();
    const localDept = localDepts.get(deptIdStr);
    if (!localDept) continue;

    const isLeader = leaderMap.get(deptIdList[i]) || false;

    await client.query(
      `INSERT INTO user_departments (user_id, dept_id, is_primary, is_leader)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, dept_id) DO NOTHING`,
      [userId, localDept.id, i === 0, isLeader]
    );
  }
}

/**
 * 更新同步时间戳（用户无变更时调用）
 */
async function updateSyncTimestamp(userId: number): Promise<void> {
  const client = await getAppClient();
  try {
    await client.query('UPDATE users SET dingtalk_last_synced_at = NOW() WHERE id = $1', [userId]);
  } finally {
    client.release();
  }
}

/**
 * 禁用离职用户
 * 本地活跃用户中，dingtalk_user_id 不在钉钉返回集合中的设为禁用
 * 返回禁用数量
 *
 * @deprecated 离职检测已由钉钉 Stream 事件驱动（user_leave_org）实时处理，
 * 定期同步不再调用此函数，避免 API 异常时误禁用户。
 * 保留代码以备特殊场景需要手动调用。
 */
async function disableDepartedUsers(dingtalkUserIds: Set<string>): Promise<number> {
  if (dingtalkUserIds.size === 0) return 0;

  // 获取本地活跃的钉钉用户（排除 dev_admin）
  const result = await getAppClient().then(async client => {
    try {
      // 找出需要禁用的用户
      const activeUsers = await client.query(
        `SELECT id, dingtalk_user_id FROM users
         WHERE status = 1
           AND dingtalk_user_id IS NOT NULL
           AND dingtalk_user_id != 'dev_admin'`
      );

      const toDisable: number[] = [];
      for (const row of activeUsers.rows) {
        if (!dingtalkUserIds.has(row.dingtalk_user_id)) {
          toDisable.push(row.id);
        }
      }

      // 诊断日志：离职检测结果
      log.info(
        `离职检测: 本地活跃=${activeUsers.rows.length}, 钉钉返回=${dingtalkUserIds.size}, 待禁用=${toDisable.length} 人, IDs=[${toDisable.join(',')}]`
      );

      if (toDisable.length === 0) return 0;

      // 批量禁用
      await client.query(
        `UPDATE users SET status = 0, updated_at = NOW()
         WHERE id = ANY($1)`,
        [toDisable]
      );

      // 刷新被禁用用户的权限缓存
      for (const userId of toDisable) {
        invalidateUserPermissionCache(userId);
      }

      return toDisable.length;
    } finally {
      client.release();
    }
  });

  return result;
}
