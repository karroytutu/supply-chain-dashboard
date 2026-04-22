/**
 * 催收考核管理路由
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  getAssessmentList,
  getMyAssessmentList,
  getAssessmentDetail,
  getAssessmentStatistics,
} from '../controllers/ar-assessment-query.controller';
import {
  handleAssessment,
  triggerAssessmentCalculation,
} from '../controllers/ar-assessment-mutation.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// ==================== 考核记录查询 ====================

/** 获取考核记录列表 */
router.get(
  '/',
  requirePermission('finance:ar:penalty:read'),
  getAssessmentList
);

/** 获取考核统计 */
router.get(
  '/stats',
  requirePermission('finance:ar:penalty:read'),
  getAssessmentStatistics
);

/** 手动触发考核计算 */
router.post(
  '/calculate',
  requirePermission('finance:ar:penalty:write'),
  triggerAssessmentCalculation
);

/** 获取我的考核记录 */
router.get(
  '/my',
  requirePermission('finance:ar:penalty:read'),
  getMyAssessmentList
);

/** 获取单条考核详情 */
router.get(
  '/:id',
  requirePermission('finance:ar:penalty:read'),
  getAssessmentDetail
);

// ==================== 考核操作 ====================

/** 标记考核处理状态（已处理 / 无需处理） */
router.post(
  '/:id/handle',
  requirePermission('finance:ar:penalty:write'),
  handleAssessment
);

export default router;
