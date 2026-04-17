import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  checkEnv,
  dingtalkAutoLogin,
  getQrcodeConfig,
  dingtalkCallback,
  getMe,
  logout,
  developmentLogin,
} from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 认证端点限流（更严格）
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: '登录尝试过多，请稍后再试' },
});

// 公开路由（无需认证）
router.get('/check-env', checkEnv);
router.post('/dingtalk/auto-login', authLimiter, dingtalkAutoLogin);
router.get('/dingtalk/qrcode-config', getQrcodeConfig);
router.post('/dingtalk/callback', authLimiter, dingtalkCallback);

// 开发环境登录（仅开发环境可用）
if (process.env.NODE_ENV === 'development') {
  router.post('/dev-login', authLimiter, developmentLogin);
} else {
  // 非开发环境返回 403
  router.post('/dev-login', authLimiter, (_req, res) => {
    res.status(403).json({
      code: 403,
      message: '开发登录端点仅在开发环境可用',
      data: null,
    });
  });
}

// 需要认证的路由
router.get('/me', authMiddleware, getMe);
router.post('/logout', authMiddleware, logout);

export default router;
