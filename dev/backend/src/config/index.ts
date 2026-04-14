import dotenv from 'dotenv';
import path from 'path';

// 根据 NODE_ENV 加载对应的配置文件
const env = process.env.NODE_ENV || 'development';
const envFile = path.resolve(__dirname, '../../.env.' + env);

dotenv.config({ path: envFile });

export const config = {
  port: parseInt(process.env.PORT || '8100', 10),
  
  // 数据源数据库（只读，查询业务数据）
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'xinshutong',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // 设置时区为北京时间
    options: '-c timezone=Asia/Shanghai',
  },
  
  // 应用数据库（读写，用户认证等）
  appDatabase: {
    host: process.env.APP_DB_HOST || 'localhost',
    port: parseInt(process.env.APP_DB_PORT || '5432', 10),
    database: process.env.APP_DB_NAME || 'xly_dashboard',
    user: process.env.APP_DB_USER || 'postgres',
    password: process.env.APP_DB_PASSWORD || 'postgres',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // 设置时区为北京时间
    options: '-c timezone=Asia/Shanghai',
  },
  
  // 钉钉配置
  dingtalk: {
    appKey: process.env.DINGTALK_APP_KEY || '',
    appSecret: process.env.DINGTALK_APP_SECRET || '',
    corpId: process.env.DINGTALK_CORP_ID || '',
    agentId: process.env.DINGTALK_AGENT_ID || '',
  },
  
  // JWT配置
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  
  // 应用基础URL配置
  app: {
    baseUrl: process.env.APP_BASE_URL || 'http://localhost:3100',
  },
};
