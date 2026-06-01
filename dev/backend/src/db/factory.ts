/**
 * 数据库连接池工厂
 * 统一 pool.ts 和 appPool.ts 的公共逻辑，消除重复代码
 */

import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import logger from '../utils/logger';

interface DatabasePoolOptions {
  name: string;
  config: PoolConfig;
}

/**
 * 创建数据库连接池及其工具函数
 * @param options.name 连接池标识名（用于日志）
 * @param options.config pg 连接池配置
 */
export function createDatabasePool({ name, config }: DatabasePoolOptions) {
  const pool = new Pool(config);

  pool.on('error', (err) => {
    // console.error 确保在 Docker 日志中可见（生产环境 logger 文件输出不可见）
    console.error(`[${name}] 数据库连接池错误:`, err?.message || err);
    logger.error(`[${name}] 数据库连接池错误:`, err);
  });

  pool.on('connect', () => {
    logger.info(`[${name}] 数据库连接成功`);
  });

  /**
   * 执行 SQL 查询
   * @param text SQL 语句
   * @param params 参数
   */
  async function query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === 'development') {
      logger.debug(`[${name}] SQL查询:`, {
        text: text.substring(0, 100) + '...',
        duration: `${duration}ms`,
        rows: result.rowCount,
      });
    }

    if (duration > 1000) {
      logger.warn(`[${name}] 慢查询 (${duration}ms):`, text.substring(0, 100));
    }

    return result;
  }

  /**
   * 获取连接池客户端（用于事务）
   */
  async function getClient(): Promise<PoolClient> {
    return pool.connect();
  }

  /**
   * 关闭连接池
   */
  async function closePool(): Promise<void> {
    await pool.end();
    logger.info(`[${name}] 连接池已关闭`);
  }

  return { pool, query, getClient, closePool };
}
