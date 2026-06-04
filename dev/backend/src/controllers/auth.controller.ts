import { Request, Response } from 'express';
import {
  autoLogin,
  qrcodeCallback,
  getCurrentUser,
  devLogin,
  devSwitchUser,
  devGetUsers,
} from '../services/auth.service';
import { config } from '../config';
import crypto from 'crypto';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';
import { createLogger } from '../utils/logger';
const log = createLogger('Auth');

// 存储state值（生产环境应使用Redis）
const stateStore = new Map<string, { expiresAt: number }>();

function normalizeOrigin(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

function getAllowedAppOrigins(): Set<string> {
  const defaultOrigins = ['http://localhost:3000', 'http://localhost:3100'];
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
    .map(origin => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));

  for (const origin of defaultOrigins) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedOrigin) {
      envOrigins.push(normalizedOrigin);
    }
  }

  const configuredBaseUrl = normalizeOrigin(config.app.baseUrl);
  if (configuredBaseUrl) {
    envOrigins.push(configuredBaseUrl);
  }

  return new Set(envOrigins);
}

function resolveAppBaseUrl(req: Request): string {
  const allowedOrigins = getAllowedAppOrigins();
  const candidateOrigins = [
    normalizeOrigin(req.get('origin')),
    normalizeOrigin(req.get('referer')),
  ].filter((origin): origin is string => Boolean(origin));

  for (const origin of candidateOrigins) {
    if (allowedOrigins.has(origin)) {
      return origin;
    }
  }

  const fallbackOrigin = normalizeOrigin(config.app.baseUrl);
  if (fallbackOrigin) {
    return fallbackOrigin;
  }
  throw new Error(`应用基础URL配置无效: ${config.app.baseUrl}`);
}

/**
 * 检测钉钉环境
 */
export async function checkEnv(req: Request, res: Response) {
  const userAgent = req.headers['user-agent'] || '';

  // 检测是否在钉钉环境
  const isInDingtalk = userAgent.toLowerCase().includes('dingtalk');

  // 检测客户端类型
  let clientType: 'pc' | 'mobile' | 'outside' = 'outside';
  if (isInDingtalk) {
    if (
      userAgent.toLowerCase().includes('mobile') ||
      userAgent.toLowerCase().includes('android') ||
      userAgent.toLowerCase().includes('iphone')
    ) {
      clientType = 'mobile';
    } else {
      clientType = 'pc';
    }
  }

  res.json(
    buildSuccessResponse({
      isInDingtalk,
      clientType,
      corpId: config.dingtalk.corpId,
      agentId: config.dingtalk.agentId,
    })
  );
}

/**
 * 钉钉免登
 */
export async function dingtalkAutoLogin(req: Request, res: Response) {
  const { authCode } = req.body;

  log.info(
    '收到免登请求, authCode:',
    authCode ? `${authCode.substring(0, 10)}... (长度: ${authCode.length})` : '空'
  );

  if (!authCode) {
    res.status(400).json(buildErrorResponse(400, '缺authCode参数'));
    return;
  }

  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const result = await autoLogin(authCode, ipAddress, userAgent);

  if (result.success) {
    res.json(
      buildSuccessResponse({ token: result.token, user: result.user }, result.message || 'success')
    );
  } else {
    res.status(401).json(buildErrorResponse(401, result.message || '登录失败'));
  }
}

/**
 * 获取扫码登录配置
 */
export async function getQrcodeConfig(req: Request, res: Response) {
  // 生成state值防CSRF
  const state = crypto.randomBytes(16).toString('hex');

  // 存储state，5分钟过期
  stateStore.set(state, { expiresAt: Date.now() + 5 * 60 * 1000 });

  // 清理过期的state
  for (const [key, value] of stateStore.entries()) {
    if (value.expiresAt < Date.now()) {
      stateStore.delete(key);
    }
  }

  // 使用配置的基础URL构建回调地址
  const baseUrl = resolveAppBaseUrl(req);
  const redirectUri = `${baseUrl}/login/callback`;

  log.info('生成扫码配置', {
    requestOrigin: req.get('origin') || null,
    requestReferer: req.get('referer') || null,
    resolvedBaseUrl: baseUrl,
    redirectUri,
  });

  res.json(
    buildSuccessResponse({
      appId: config.dingtalk.appKey,
      redirectUri,
      state,
    })
  );
}

/**
 * 扫码登录回调
 */
export async function dingtalkCallback(req: Request, res: Response) {
  const { authCode, code, state } = req.body;

  // 使用authCode或code（钉钉不同版本的参数名可能不同）
  const actualCode = authCode || code;

  if (!actualCode) {
    res.status(400).json(buildErrorResponse(400, '缺少授权码'));
    return;
  }

  // 验证state（防CSRF）
  if (state && !stateStore.has(state)) {
    res.status(400).json(buildErrorResponse(400, '无效的state参数'));
    return;
  }

  // 清除已使用的state
  if (state) {
    stateStore.delete(state);
  }

  log.info('收到扫码回调请求', {
    hasState: Boolean(state),
    codeLength: actualCode.length,
    requestOrigin: req.get('origin') || null,
    requestReferer: req.get('referer') || null,
  });

  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const result = await qrcodeCallback(actualCode, ipAddress, userAgent);

  if (result.success) {
    res.json(
      buildSuccessResponse({ token: result.token, user: result.user }, result.message || 'success')
    );
  } else {
    log.warn('扫码登录失败', {
      message: result.message || '登录失败',
      hasState: Boolean(state),
    });
    res.status(401).json(buildErrorResponse(401, result.message || '登录失败'));
  }
}

/**
 * 获取当前用户信息
 */
export async function getMe(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json(buildErrorResponse(401, '未登录'));
    return;
  }

  const user = await getCurrentUser(req.user.userId);

  if (!user) {
    res.status(404).json(buildErrorResponse(404, '用户不存在'));
    return;
  }

  res.json(buildSuccessResponse(user));
}

/**
 * 登出
 */
export async function logout(req: Request, res: Response) {
  // JWT是无状态的，登出只需前端删除Token
  // 如果需要服务端控制，可以实现Token黑名单
  res.json(buildSuccessResponse(null, '已登出'));
}

/**
 * 开发环境管理员登录（仅用于开发调试）
 */
export async function developmentLogin(req: Request, res: Response) {
  // 仅允许开发环境
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json(buildErrorResponse(403, '开发登录仅用于开发环境'));
    return;
  }

  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const result = await devLogin(ipAddress, userAgent);

  if (result.success) {
    res.json(
      buildSuccessResponse({ token: result.token, user: result.user }, result.message || 'success')
    );
  } else {
    res.status(401).json(buildErrorResponse(401, result.message || '登录失败'));
  }
}

/**
 * 获取可切换用户列表
 * 开发环境：仅需登录
 * 生产环境：需 system:user:switch 权限（由路由层中间件控制）
 */
export async function developmentGetUsers(req: Request, res: Response) {
  const users = await devGetUsers();

  res.json(buildSuccessResponse(users));
}

/**
 * 切换用户
 * 开发环境：仅需登录
 * 生产环境：需 system:user:switch 权限（由路由层中间件控制）
 */
export async function developmentSwitchUser(req: Request, res: Response) {
  const { userId } = req.body;

  if (!userId || typeof userId !== 'number') {
    res.status(400).json(buildErrorResponse(400, '缺userId参数'));
    return;
  }

  const result = await devSwitchUser(userId);

  if (result.success) {
    res.json(
      buildSuccessResponse({ token: result.token, user: result.user }, result.message || 'success')
    );
  } else {
    res.status(401).json(buildErrorResponse(401, result.message || '切换失败'));
  }
}
