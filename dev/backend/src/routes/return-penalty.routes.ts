/**
 * 退货考核管理路由
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  getPenaltyList,
  getMyPenaltyList,
  getPenaltyDetail,
  getPenaltyStatistics,
  confirmPenalty,
  cancelPenalty,
  appealPenalty,
} from '../controllers/return-penalty.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// ==================== 考核记录查询 ====================

/**
 * 获取考核记录列表
 * GET /api/return-penalty
 * 权限: return:penalty:read
 */
router.get(
  '/',
  requirePermission('return:penalty:read'),
  getPenaltyList
);

/**
 * 获取考核统计
 * GET /api/return-penalty/stats
 * 权限: return:penalty:read
 */
router.get(
  '/stats',
  requirePermission('return:penalty:read'),
  getPenaltyStatistics
);

/**
 * 获取我的考核记录
 * GET /api/return-penalty/my
 * 权限: return:penalty:read
 */
router.get(
  '/my',
  requirePermission('return:penalty:read'),
  getMyPenaltyList
);

/**
 * 获取单条考核详情
 * GET /api/return-penalty/:id
 * 权限: return:penalty:read
 */
router.get(
  '/:id',
  requirePermission('return:penalty:read'),
  getPenaltyDetail
);

// ==================== 考核操作 ====================

/**
 * 确认考核
 * POST /api/return-penalty/:id/confirm
 * 权限: return:penalty:write
 */
router.post(
  '/:id/confirm',
  requirePermission('return:penalty:write'),
  confirmPenalty
);

/**
 * 取消考核
 * POST /api/return-penalty/:id/cancel
 * 权限: return:penalty:write
 */
router.post(
  '/:id/cancel',
  requirePermission('return:penalty:write'),
  cancelPenalty
);

/**
 * 申诉考核
 * POST /api/return-penalty/:id/appeal
 * 权限: return:penalty:read
 */
router.post(
  '/:id/appeal',
  requirePermission('return:penalty:read'),
  appealPenalty
);

export default router;
