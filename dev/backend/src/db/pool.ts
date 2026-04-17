import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import logger from '../utils/logger';

// 创建连接池
const pool = new Pool(config.database);

// 连接池错误处理
pool.on('error', (err) => {
  logger.error('[DB Pool] Unexpected error on idle client:', err);
});

// 测试连接
pool.on('connect', () => {
  logger.info('数据库连接成功');
});

/**
 * 执行SQL查询
 * @param text SQL语句
 * @param params 参数
 * @returns 查询结果
 */
export async function query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  
  if (process.env.NODE_ENV === 'development') {
    logger.debug('SQL查询:', { 
      text: text.substring(0, 100) + '...', 
      duration: `${duration}ms`, 
      rows: result.rowCount 
    });
  }
  
  return result;
}

/**
 * 获取连接池客户端（用于事务）
 */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/**
 * 关闭连接池
 */
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('数据库连接池已关闭');
}

export default { query, getClient, closePool };
