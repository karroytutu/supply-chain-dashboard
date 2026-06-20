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
  developmentSwitchUser,
  developmentGetUsers,
} from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

// 认证端点限流（100次/15分钟，防止暴力破解同时不影响正常使用）
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: '请求过于频繁，请稍后再试' },
});

// 公开路由（无需认证）
router.get('/check-env', checkEnv);
router.post('/dingtalk/auto-login', authLimiter, dingtalkAutoLogin);
router.get('/dingtalk/qrcode-config', getQrcodeConfig);
router.post('/dingtalk/callback', authLimiter, dingtalkCallback);

// 开发环境管理员免认证登录（仅开发环境可用，绕过钉钉认证，安全级别与切换用户不同）
// 开发端点不限流：仅内网可用，E2E 测试需要高频调用 dev-login/dev-switch
if (process.env.NODE_ENV === 'development') {
  router.post('/dev-login', developmentLogin);
} else {
  router.post('/dev-login', authLimiter, (_req, res) => {
    res.status(403).json({
      code: 403,
      message: '开发登录端点仅在开发环境可用',
      data: null,
    });
  });
}

// 用户切换：始终注册，环境感知权限
// 开发环境：仅需登录（authMiddleware），不限流（E2E 测试高频调用）
// 生产环境：需登录 + system:user:switch 权限 + 限流
const switchAuth =
  process.env.NODE_ENV === 'development'
    ? [authMiddleware]
    : [authLimiter, authMiddleware, requirePermission('system:user:switch')];

router.post('/dev-switch', ...switchAuth, developmentSwitchUser);
router.get('/dev-users', ...switchAuth, developmentGetUsers);

// 需要认证的路由
router.get('/me', authMiddleware, getMe);
router.post('/logout', authMiddleware, logout);

export default router;
