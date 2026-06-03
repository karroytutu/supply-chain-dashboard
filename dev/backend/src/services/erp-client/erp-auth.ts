/**
 * ERP 认证管理
 * Token 获取、缓存、自动刷新
 * Token 来源：内置 Token 管理模块（由 Playwright/HTTP 登录 + 定时任务维护）
 * @module services/erp-client/erp-auth
 */

import type { ErpToken } from './erp-client.types';

/**
 * Token 缓存
 *
 * 不使用统一 MemoryCache 的原因：
 * 1. 需要提前 1 小时刷新（REFRESH_AHEAD_MS），而 MemoryCache 仅支持固定 TTL 过期
 * 2. 使用 _refreshPromise 锁防止并发刷新，该模式与 MemoryCache 的 get/set 不兼容
 */
let _tokenCache: ErpToken | null = null;

/** 提前刷新时间（1小时） */
const REFRESH_AHEAD_MS = 60 * 60 * 1000;

/** Token 刷新锁，防止并发重复获取 */
let _refreshPromise: Promise<ErpToken> | null = null;

/**
 * 获取有效的 ERP 访问令牌（自动刷新）
 */
export async function getErpAccessToken(): Promise<string> {
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
 * 从内置 Token 管理模块获取（由定时任务维护的 PostgreSQL 存储）
 */
export async function refreshErpToken(): Promise<ErpToken> {
  const { getNativeToken } = await import('../token-manager');
  const result = await getNativeToken();

  const token: ErpToken = { authorization: result.authorization, expiresAt: result.expiresAt };
  _tokenCache = token;

  console.log(`[ErpAuth] Token 刷新成功, 过期时间: ${new Date(result.expiresAt).toISOString()}`);
  return token;
}

/**
 * 使 Token 缓存失效
 */
export function invalidateErpToken(): void {
  _tokenCache = null;
}

/**
 * 获取 WMS Session ID（用于 Cookie 认证）
 * 从 Token 管理模块独立读取（WMS 登录由 token-manager 模块管理）
 */
export async function getWmsSessionId(): Promise<string> {
  const { getNativeWmsSessionId } = await import('../token-manager');
  const sessionId = await getNativeWmsSessionId();
  if (!sessionId) {
    throw new Error('WMS Session 不可用，请通过管理后台执行 WMS 登录');
  }
  return sessionId;
}
