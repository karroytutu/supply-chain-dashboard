/**
 * 战略商品管理路由
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  getStrategicProductsController,
  getStrategicProductStatsController,
  getCategoryTreeController,
  getProductsForSelectionController,
} from '../controllers/strategic-product-query.controller';
import {
  addStrategicProductsController,
  deleteStrategicProductController,
  confirmStrategicProductController,
  batchConfirmStrategicProductsController,
  batchDeleteStrategicProductsController,
  syncCategoryPathController,
} from '../controllers/strategic-product-mutation.controller';

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
  '/categories/tree',
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

// 同步品类路径
router.post(
  '/sync-category',
  requirePermission('strategic:write'),
  syncCategoryPathController
);

// 批量确认战略商品
router.post(
  '/batch/confirm',
  requirePermission(['strategic:confirm:procurement', 'strategic:confirm:marketing']),
  batchConfirmStrategicProductsController
);

// 批量删除战略商品
router.post(
  '/batch/delete',
  requirePermission('strategic:write'),
  batchDeleteStrategicProductsController
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
