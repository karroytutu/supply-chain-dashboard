/**
 * ERP 同步状态监控路由
 * @module routes/erp-sync
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  getSyncStatus,
  getSyncLog,
  handleForceSync,
  handleResetCircuit,
  handleFullLoad,
} from '../controllers/erp-sync-status.controller';

const router = Router();

// 查看同步状态和日志
router.get('/status', authMiddleware, requirePermission('system:erp-sync:read'), getSyncStatus);
router.get('/log', authMiddleware, requirePermission('system:erp-sync:read'), getSyncLog);

// 强制同步、重置熔断器、全量加载（需要写权限）
router.post('/:id/force-sync', authMiddleware, requirePermission('system:erp-sync:write'), handleForceSync);
router.post('/:id/reset-circuit', authMiddleware, requirePermission('system:erp-sync:write'), handleResetCircuit);
router.post('/:id/full-load', authMiddleware, requirePermission('system:erp-sync:write'), handleFullLoad);

export default router;
