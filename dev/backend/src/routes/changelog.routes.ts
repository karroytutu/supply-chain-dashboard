import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getChangelog } from '../controllers/changelog.controller';

const router = Router();

// GET /api/changelog — 获取更新日志列表
router.get('/', authMiddleware, getChangelog);

export default router;
