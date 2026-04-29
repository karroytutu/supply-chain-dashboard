/**
 * ERP 数据库连接池（只读）
 * 连接鑫蔬通 ERP 系统数据库
 */

import { createDatabasePool } from './factory';
import { config } from '../config';

const { query, getClient, closePool } = createDatabasePool({
  name: 'ERP数据库(只读)',
  config: config.database,
});

export { query, getClient, closePool };
export default { query, getClient, closePool };
