/**
 * 采购绩效存档路由
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { getArchiveList, generateArchive } from '../controllers/procurement-archive.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 获取月度存档列表
router.get(
  '/archive',
  requirePermission('procurement:archive:read'),
  getArchiveList
);

// 手动触发月度存档
router.post(
  '/archive/generate',
  requirePermission('procurement:archive:read'),
  generateArchive
);

export default router;
