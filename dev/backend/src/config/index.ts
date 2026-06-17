import dotenv from 'dotenv';
import path from 'path';

// 根据 NODE_ENV 加载对应的配置文件
const env = process.env.NODE_ENV || 'development';
const envFile = path.resolve(__dirname, '../../.env.' + env);

dotenv.config({ path: envFile });

// JWT 密钥安全校验 - 生产环境必须使用强密钥
const defaultJwtSecret = 'DEVELOPMENT-ONLY-JWT-SECRET-NOT-FOR-PRODUCTION';
const jwtSecret = process.env.JWT_SECRET || defaultJwtSecret;

// 生产环境强制检查 JWT_SECRET
if (env === 'production') {
  const isDefaultSecret =
    !process.env.JWT_SECRET ||
    jwtSecret === defaultJwtSecret ||
    jwtSecret === 'your-secret-key-change-in-production' ||
    jwtSecret.length < 32;

  if (isDefaultSecret) {
    throw new Error(
      '[SECURITY ERROR] 生产环境必须设置强 JWT_SECRET 环境变量（至少32位随机字符）。' +
        '请使用以下命令生成：openssl rand -base64 32'
    );
  }
}

const DEFAULT_BACKEND_PORT = 8100;

export const config = {
  port: parseInt(process.env.PORT || String(DEFAULT_BACKEND_PORT), 10),

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
    maxUses: 7500,
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
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  // 应用基础URL配置
  app: {
    baseUrl: process.env.APP_BASE_URL || 'http://localhost:3100',
  },

  // 舟谱云管家 ERP API 配置
  erpApi: {
    baseUrl: process.env.ERP_API_BASE_URL || 'https://portal.zhoupudata.com',
    cid: process.env.ERP_API_CID || '10008421',
    uid: process.env.ERP_API_UID || '1',
    timeout: parseInt(process.env.ERP_API_TIMEOUT || '10000', 10),
    retryMax: parseInt(process.env.ERP_API_RETRY_MAX || '3', 10),
    rateLimitMs: parseInt(process.env.ERP_API_RATE_LIMIT_MS || '200', 10),
    maxGroupConcurrency: parseInt(process.env.ERP_API_MAX_GROUP_CONCURRENCY || '4', 10),
    maxGlobalConcurrency: parseInt(process.env.ERP_API_MAX_GLOBAL_CONCURRENCY || '12', 10),
  },

  // Token 管理模块（内置 Token 获取，替代外部 API）
  tokenManager: {
    erpUsername: process.env.ERP_LOGIN_USERNAME || '',
    erpPassword: process.env.ERP_LOGIN_PASSWORD || '',
    wmsUsername: process.env.WMS_LOGIN_USERNAME || '',
    wmsPassword: process.env.WMS_LOGIN_PASSWORD || '',
    wmsSsoBaseUrl: process.env.WMS_SSO_BASE_URL || 'https://sso.zhoupudata.com',
    b2bBaseUrl: process.env.B2B_BASE_URL || 'https://bluespace-plus.zhoupudata.com',
  },
};
