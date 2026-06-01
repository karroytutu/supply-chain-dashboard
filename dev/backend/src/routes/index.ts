import { Router } from 'express';
import { healthCheck, getDashboard, getWarningProductsController, getCategoryTreeController, getCategoryOutOfStockController } from '../controllers/dashboard.controller';
import { getOverviewStatsController, getOverviewFullController, getTrendDataController } from '../controllers/overview.controller';
import { getThresholds } from '../controllers/config.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 健康检查（公开，无需认证）
router.get('/health', healthCheck);

// 业务阈值配置（供前端同步后端常量，公开）
router.get('/config/thresholds', getThresholds);

// 以下业务路由需要认证
router.use(authMiddleware);

// 数据总览 - 完整概览（stats + trend，推荐前端使用此端点）
router.get('/overview/full', getOverviewFullController);
router.get('/overview/stats', getOverviewStatsController);
router.get('/overview/trend', getTrendDataController);

// Dashboard 数据
router.get('/dashboard', getDashboard);

// 预警商品列表
router.get('/warnings/:type', getWarningProductsController);

// 品类库存齐全率相关
router.get('/availability/category-tree', getCategoryTreeController);
router.get('/availability/out-of-stock', getCategoryOutOfStockController);

export default router;
