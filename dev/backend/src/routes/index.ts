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

// 以下业务路由需要认证（逐路由应用 authMiddleware，避免 router.use() 拦截非本路由的请求）
router.get('/overview/full', authMiddleware, getOverviewFullController);
router.get('/overview/stats', authMiddleware, getOverviewStatsController);
router.get('/overview/trend', authMiddleware, getTrendDataController);

// Dashboard 数据
router.get('/dashboard', authMiddleware, getDashboard);

// 预警商品列表
router.get('/warnings/:type', authMiddleware, getWarningProductsController);

// 品类库存齐全率相关
router.get('/availability/category-tree', authMiddleware, getCategoryTreeController);
router.get('/availability/out-of-stock', authMiddleware, getCategoryOutOfStockController);

export default router;
