import { Router } from 'express';
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

// 公开路由（无需认证）
router.get('/check-env', checkEnv);
router.post('/dingtalk/auto-login', dingtalkAutoLogin);
router.get('/dingtalk/qrcode-config', getQrcodeConfig);
router.post('/dingtalk/callback', dingtalkCallback);

// 开发环境登录（仅开发环境可用）
router.post('/dev-login', developmentLogin);

// 需要认证的路由
router.get('/me', authMiddleware, getMe);
router.post('/logout', authMiddleware, logout);

export default router;
