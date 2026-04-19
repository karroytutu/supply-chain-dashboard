/**
 * 钉钉同步路由
 */

import { Router } from 'express';
import {
  triggerFullSync,
  triggerDeptSync,
  listSyncLogs,
  getSyncLogDetail,
  getCurrentSyncStatus,
} from '../controllers/dingtalk-sync.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 触发全量同步
router.post('/full', requirePermission('system:sync:write'), triggerFullSync);

// 按部门同步
router.post('/department/:deptId', requirePermission('system:sync:write'), triggerDeptSync);

// 获取同步状态
router.get('/status', requirePermission('system:sync:read'), getCurrentSyncStatus);

// 同步日志列表
router.get('/logs', requirePermission('system:sync:read'), listSyncLogs);

// 同步日志详情
router.get('/logs/:id', requirePermission('system:sync:read'), getSyncLogDetail);

export default router;
