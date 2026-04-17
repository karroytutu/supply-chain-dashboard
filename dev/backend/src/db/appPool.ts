import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import logger from '../utils/logger';

// 创建应用数据库连接池（用户认证等）
const appPool = new Pool(config.appDatabase);

// 连接池错误处理
appPool.on('error', (err) => {
  logger.error('[App DB Pool] Unexpected error on idle client:', err);
});

// 测试连接
appPool.on('connect', () => {
  logger.info('应用数据库连接成功');
});

/**
 * 执行SQL查询（应用数据库）
 * @param text SQL语句
 * @param params 参数
 * @returns 查询结果
 */
export async function appQuery<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await appPool.query<T>(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    logger.debug('应用数据库查询:', {
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
export async function getAppClient(): Promise<PoolClient> {
  return appPool.connect();
}

/**
 * 关闭连接池
 */
export async function closeAppPool(): Promise<void> {
  await appPool.end();
  logger.info('应用数据库连接池已关闭');
}

export default { appQuery, getAppClient, closeAppPool };
