/**
 * 基于 PostgreSQL advisory lock 的分布式锁工具
 * @module utils/distributed-lock
 *
 * 使用 pg_advisory_xact_lock：锁绑定到当前事务，事务提交/回滚时自动释放，
 * 无需手动 unlock，适合单数据库部署场景。
 *
 * 注意：字符串 key 通过 hashtext() 转为 bigint，该函数存在理论碰撞风险。
 * 当前项目锁 key 数量极少（个位数），碰撞概率几乎为零；
 * 长期若锁 key 大量增加，可改用 md5(lockKey)::bit(64)::bigint 降低碰撞概率。
 */

import { getAppClient } from '../db/appPool';
import type { PoolClient } from 'pg';

/**
 * 在事务内获取 advisory lock 并执行回调
 * @param lockKey - 锁标识：number 直接使用；string 会哈希为 bigint
 * @param callback - 在锁保护下执行的逻辑，接收事务 client
 */
export async function withAdvisoryLock<T>(
  lockKey: number | string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getAppClient();
  try {
    await client.query('BEGIN');
    if (typeof lockKey === 'number') {
      await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
    } else {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [lockKey]);
    }
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** 常用锁 key 命名空间（字符串形式，避免与其他 advisory lock 冲突） */
export const OA_LOCK_KEYS = {
  timeoutScan: 'oa:timeout:scan',
  templatePrefix: 'oa:template:',
  instancePrefix: 'oa:instance:',
} as const;

/** 获取实例级 advisory lock 的 number key（与 pg_advisory_xact_lock(instanceId) 保持一致） */
export function getInstanceLockKey(instanceId: number): number {
  return instanceId;
}
