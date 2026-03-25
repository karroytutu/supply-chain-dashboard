/**
 * 战略商品管理路由
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  getStrategicProductsController,
  getStrategicProductStatsController,
  addStrategicProductsController,
  deleteStrategicProductController,
  confirmStrategicProductController,
  getCategoryTreeController,
  getProductsForSelectionController,
} from '../controllers/strategic-product.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 获取战略商品列表
router.get(
  '/',
  requirePermission('strategic:read'),
  getStrategicProductsController
);

// 获取统计数据
router.get(
  '/stats',
  requirePermission('strategic:read'),
  getStrategicProductStatsController
);

// 获取品类树
router.get(
  '/categories',
  requirePermission('strategic:read'),
  getCategoryTreeController
);

// 获取可选商品列表
router.get(
  '/products',
  requirePermission('strategic:read'),
  getProductsForSelectionController
);

// 批量添加战略商品
router.post(
  '/',
  requirePermission('strategic:write'),
  addStrategicProductsController
);

// 确认战略商品（采购主管或营销主管）
router.post(
  '/:id/confirm',
  requirePermission(['strategic:confirm:procurement', 'strategic:confirm:marketing']),
  confirmStrategicProductController
);

// 删除战略商品
router.delete(
  '/:id',
  requirePermission('strategic:write'),
  deleteStrategicProductController
);

export default router;
