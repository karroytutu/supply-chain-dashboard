/**
 * 目标管理路由
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  listHandler,
  detailHandler,
  createHandler,
  updateHandler,
  deleteHandler,
  initDataHandler,
  overviewHandler,
  marketersHandler,
  customersHandler,
  productsHandler,
  historicalSalesHandler,
} from '../controllers/sales-target.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 查询类（read 权限）
router.get('/', requirePermission('sales:target:read'), listHandler);
router.get('/init-data', requirePermission('sales:target:read'), initDataHandler);
router.get('/overview', requirePermission('sales:target:read'), overviewHandler);
router.get('/marketers', requirePermission('sales:target:read'), marketersHandler);
router.get('/customers', requirePermission('sales:target:read'), customersHandler);
router.get('/products', requirePermission('sales:target:read'), productsHandler);
router.get('/historical-sales', requirePermission('sales:target:read'), historicalSalesHandler);
router.get('/:id', requirePermission('sales:target:read'), detailHandler);

// 写入类（write 权限）
router.post('/', requirePermission('sales:target:write'), createHandler);
router.put('/:id', requirePermission('sales:target:write'), updateHandler);
router.delete('/:id', requirePermission('sales:target:write'), deleteHandler);

export default router;
