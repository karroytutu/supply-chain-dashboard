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
} from '../controllers/return-penalty-query.controller';
import {
  confirmPenalty,
  cancelPenalty,
  appealPenalty,
  triggerPenaltyCalculation,
} from '../controllers/return-penalty-mutation.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// ==================== 考核记录查询 ====================

/** 获取考核记录列表 */
router.get(
  '/',
  requirePermission('finance:ar:penalty'),
  getPenaltyList
);

/** 获取考核统计 */
router.get(
  '/stats',
  requirePermission('finance:ar:penalty'),
  getPenaltyStatistics
);

/** 手动触发考核计算 */
router.post(
  '/calculate',
  requirePermission('finance:ar:penalty'),
  triggerPenaltyCalculation
);

/** 获取我的考核记录 */
router.get(
  '/my',
  requirePermission('finance:ar:penalty'),
  getMyPenaltyList
);

/** 获取单条考核详情 */
router.get(
  '/:id',
  requirePermission('finance:ar:penalty'),
  getPenaltyDetail
);

// ==================== 考核操作 ====================

/** 确认考核 */
router.post(
  '/:id/confirm',
  requirePermission('finance:ar:penalty'),
  confirmPenalty
);

/** 取消考核 */
router.post(
  '/:id/cancel',
  requirePermission('finance:ar:penalty'),
  cancelPenalty
);

/** 申诉考核 */
router.post(
  '/:id/appeal',
  requirePermission('finance:ar:penalty'),
  appealPenalty
);

export default router;
