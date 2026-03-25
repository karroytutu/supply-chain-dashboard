import { Request, Response } from 'express';
import { autoLogin, qrcodeCallback, getCurrentUser, devLogin } from '../services/auth.service';
import { config } from '../config';
import crypto from 'crypto';

// 存储state值（生产环境应使用Redis）
const stateStore = new Map<string, { expiresAt: number }>();

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
    if (userAgent.toLowerCase().includes('mobile') || userAgent.toLowerCase().includes('android') || userAgent.toLowerCase().includes('iphone')) {
      clientType = 'mobile';
    } else {
      clientType = 'pc';
    }
  }
  
  res.json({
    isInDingtalk,
    clientType,
    corpId: config.dingtalk.corpId,
    agentId: config.dingtalk.agentId,
  });
}

/**
 * 钉钉免登
 */
export async function dingtalkAutoLogin(req: Request, res: Response) {
  const { authCode } = req.body;
  
  console.log('[Auth] 收到免登请求, authCode:', authCode ? `${authCode.substring(0, 10)}... (长度: ${authCode.length})` : '空');
  
  if (!authCode) {
    res.status(400).json({
      success: false,
      message: '缺少authCode参数',
    });
    return;
  }
  
  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  const result = await autoLogin(authCode, ipAddress, userAgent);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(401).json(result);
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
  const baseUrl = config.app.baseUrl;
  const redirectUri = `${baseUrl}/login/callback`;
  
  res.json({
    appId: config.dingtalk.appKey,
    redirectUri,
    state,
  });
}

/**
 * 扫码登录回调
 */
export async function dingtalkCallback(req: Request, res: Response) {
  const { authCode, code, state } = req.body;
  
  // 使用authCode或code（钉钉不同版本的参数名可能不同）
  const actualCode = authCode || code;
  
  if (!actualCode) {
    res.status(400).json({
      success: false,
      message: '缺少授权码',
    });
    return;
  }
  
  // 验证state（可选，增强安全性）
  // if (state && !stateStore.has(state)) {
  //   res.status(400).json({
  //     success: false,
  //     message: '无效的state参数',
  //   });
  //   return;
  // }
  
  // 清除已使用的state
  if (state) {
    stateStore.delete(state);
  }
  
  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  const result = await qrcodeCallback(actualCode, ipAddress, userAgent);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(401).json(result);
  }
}

/**
 * 获取当前用户信息
 */
export async function getMe(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: '未登录',
    });
    return;
  }
  
  const user = await getCurrentUser(req.user.userId);
  
  if (!user) {
    res.status(404).json({
      success: false,
      message: '用户不存在',
    });
    return;
  }
  
  res.json(user);
}

/**
 * 登出
 */
export async function logout(req: Request, res: Response) {
  // JWT是无状态的，登出只需前端删除Token
  // 如果需要服务端控制，可以实现Token黑名单
  res.json({
    success: true,
    message: '已登出',
  });
}

/**
 * 开发环境管理员登录（仅用于开发调试）
 */
export async function developmentLogin(req: Request, res: Response) {
  // 仅允许开发环境
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({
      success: false,
      message: '开发登录仅用于开发环境',
    });
    return;
  }

  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const result = await devLogin(ipAddress, userAgent);

  if (result.success) {
    res.json(result);
  } else {
    res.status(401).json(result);
  }
}
