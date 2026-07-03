/**
 * 统一考核管理路由
 * 合并催收考核和退货考核为统一的 /api/assessment 端点
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  getRecords,
  getStats,
  getMyRecords,
  getCategories,
  getUsers,
  getDetail,
} from '../controllers/assessment-query.controller';
import {
  handleAction,
  handleAppeal,
  handleCalculate,
} from '../controllers/assessment-mutation.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// ==================== 查询接口（assessment:read 权限）====================

/** 获取考核记录列表 */
router.get('/', requirePermission('assessment:read'), getRecords);

/** 获取考核统计数据 */
router.get('/stats', requirePermission('assessment:read'), getStats);

/** 获取我的考核记录 */
router.get('/my', requirePermission('assessment:read'), getMyRecords);

/** 获取分类配置（各分类的规则类型列表） */
router.get('/categories', requirePermission('assessment:read'), getCategories);

/** 获取有考核记录的被考核人列表（用于筛选下拉） */
router.get('/users', requirePermission('assessment:read'), getUsers);

// ==================== 操作接口（assessment:write 权限）====================

/** 手动触发考核计算（放在 /:id 路由之前，避免 'calculate' 被匹配为 :id） */
router.post('/calculate', requirePermission('assessment:write'), handleCalculate);

// ==================== 参数路由（必须放在静态路由之后）====================

/** 获取单条考核记录详情 */
router.get('/:id', requirePermission('assessment:read'), getDetail);

/** 统一状态操作（确认/取消） */
router.post('/:id/action', requirePermission('assessment:write'), handleAction);

/** 发起申诉 */
router.post('/:id/appeal', requirePermission('assessment:write'), handleAppeal);

export default router;
