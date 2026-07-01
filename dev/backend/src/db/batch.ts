/**
 * 批量数据库操作工具
 * 提供分批 INSERT 能力，避免单条 SQL 参数超过 PostgreSQL 65535 上限
 * @module db/batch
 */

import type { PoolClient } from 'pg';

/** 默认每批行数 */
export const DEFAULT_BATCH_SIZE = 500;

/**
 * 分批插入数据
 *
 * 不自行管理事务（由调用者控制 BEGIN/COMMIT/ROLLBACK）。
 * 每批独立执行一条 INSERT，参数占位符在每批内从 $1 重新开始。
 *
 * @param client - 已获取的 PoolClient（调用者负责事务管理）
 * @param tableName - 目标表名
 * @param columns - 列名数组
 * @param rows - 行数据数组，每行为一个值数组，顺序与 columns 对应
 * @param batchSize - 每批行数，默认 500
 * @returns 插入的总行数
 */
export async function batchInsert(
  client: PoolClient,
  tableName: string,
  columns: string[],
  rows: unknown[][],
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<number> {
  let totalInserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const row of batch) {
      placeholders.push(`(${row.map(() => `$${idx++}`).join(', ')})`);
      values.push(...row);
    }
    await client.query(
      `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`,
      values,
    );
    totalInserted += batch.length;
  }
  return totalInserted;
}
