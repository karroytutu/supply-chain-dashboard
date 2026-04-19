/**
 * ERP 认证管理
 * Token 获取、缓存、自动刷新
 * @module services/erp-client/erp-auth
 */

import axios from 'axios';
import { getErpConfig } from './erp-config';
import type { ErpToken } from './erp-client.types';

/** Token 缓存 */
let _tokenCache: ErpToken | null = null;

/** 提前刷新时间（1小时） */
const REFRESH_AHEAD_MS = 60 * 60 * 1000;

/** Token 刷新锁，防止并发重复获取 */
let _refreshPromise: Promise<ErpToken> | null = null;

/**
 * 获取有效的 ERP 访问令牌（自动刷新）
 */
export async function getErpAccessToken(): Promise<string> {
  const erpConfig = getErpConfig();

  // 检查缓存的 token 是否有效
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + REFRESH_AHEAD_MS) {
    return _tokenCache.authorization;
  }

  // 如果正在刷新，等待刷新完成
  if (_refreshPromise) {
    const token = await _refreshPromise;
    return token.authorization;
  }

  // 发起刷新
  _refreshPromise = refreshErpToken().finally(() => {
    _refreshPromise = null;
  });

  try {
    const token = await _refreshPromise;
    return token.authorization;
  } catch (error) {
    // 刷新失败，清除缓存
    invalidateErpToken();
    throw error;
  }
}

/**
 * 刷新 ERP Token
 * 调用企业内部代理端点获取 JWT Bearer Token
 */
export async function refreshErpToken(): Promise<ErpToken> {
  const erpConfig = getErpConfig();

  if (!erpConfig.tokenUrl) {
    throw new Error('ERP_API_TOKEN_URL 未配置');
  }

  console.log('[ErpAuth] 开始刷新舟谱 Token...');

  const response = await axios.get(erpConfig.tokenUrl, {
    timeout: 15000,
  });

  const data = response.data;

  // 解析响应: { output: [{ authorization: "eyJ..." }], code: 0 }
  if (!data || data.code !== 0 || !data.output || !Array.isArray(data.output) || data.output.length === 0) {
    throw new Error(`舟谱 Token 获取失败: ${JSON.stringify(data)}`);
  }

  const authorization = data.output[0].authorization;
  if (!authorization) {
    throw new Error('舟谱 Token 响应中缺少 authorization 字段');
  }

  // 解析 JWT 获取过期时间
  let expiresAt: number;
  try {
    const payloadBase64 = authorization.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
    // JWT exp 字段可能是毫秒或秒
    const exp = payload.u?.exp || payload.exp;
    expiresAt = exp > 1e12 ? exp : exp * 1000; // 判断是毫秒还是秒
  } catch {
    // 解析失败时默认13天过期
    expiresAt = Date.now() + 13 * 24 * 60 * 60 * 1000;
  }

  const token: ErpToken = { authorization, expiresAt };
  _tokenCache = token;

  console.log(`[ErpAuth] Token 刷新成功, 过期时间: ${new Date(expiresAt).toISOString()}`);
  return token;
}

/**
 * 使 Token 缓存失效
 */
export function invalidateErpToken(): void {
  _tokenCache = null;
}
