/**
 * 商品退货规则路由
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  getGoodsReturnRulesController,
  getGoodsReturnRuleStatsController,
  createGoodsReturnRuleController,
  updateGoodsReturnRuleController,
  batchSetGoodsReturnRulesController,
  checkGoodsReturnRuleController,
} from '../controllers/return-order.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 获取商品退货规则列表
router.get(
  '/',
  requirePermission('goods-rules:read'),
  getGoodsReturnRulesController
);

// 获取商品退货规则统计
router.get(
  '/stats',
  requirePermission('goods-rules:read'),
  getGoodsReturnRuleStatsController
);

// 检查商品退货规则
router.get(
  '/check/:goodsId',
  requirePermission('goods-rules:read'),
  checkGoodsReturnRuleController
);

// 创建商品退货规则
router.post(
  '/',
  requirePermission('goods-rules:write'),
  createGoodsReturnRuleController
);

// 更新商品退货规则
router.put(
  '/:id',
  requirePermission('goods-rules:write'),
  updateGoodsReturnRuleController
);

// 批量设置商品退货规则
router.post(
  '/batch',
  requirePermission('goods-rules:write'),
  batchSetGoodsReturnRulesController
);

export default router;
