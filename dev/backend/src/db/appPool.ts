/**
 * 应用数据库连接池（读写）
 * 连接供应链仪表盘应用数据库
 */

import { createDatabasePool } from './factory';
import { config } from '../config';

const { query, getClient, closePool } = createDatabasePool({
  name: '应用数据库(读写)',
  config: config.appDatabase,
});

// 保持原有导出名称兼容
export { query as appQuery, getClient as getAppClient, closePool as closeAppPool };
export default { appQuery: query, getAppClient: getClient, closeAppPool: closePool };
