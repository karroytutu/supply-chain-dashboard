import { getAppClient } from '../db/appPool';
import { PoolClient } from 'pg';

/**
 * 事务 helper - 统一事务执行模式
 * 自动管理 BEGIN / COMMIT / ROLLBACK 和客户端释放
 *
 * @param fn 在事务中执行的回调函数，接收 PoolClient 参数
 * @returns 回调函数的返回值
 *
 * @example
 * const result = await withTransaction(async (client) => {
 *   await client.query('INSERT INTO ... VALUES ($1)', [data]);
 *   await client.query('UPDATE ... SET x = $1', [val]);
 *   return { success: true };
 * });
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getAppClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
