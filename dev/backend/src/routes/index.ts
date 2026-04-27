import { Router } from 'express';
import { healthCheck, getDashboard, getWarningProductsController, getCategoryTreeController, getCategoryOutOfStockController } from '../controllers/dashboard.controller';
import { getOverviewStatsController, getTrendDataController } from '../controllers/overview.controller';
import { getThresholds } from '../controllers/config.controller';

const router = Router();

// 健康检查
router.get('/health', healthCheck);

// 业务阈值配置（供前端同步后端常量）
router.get('/config/thresholds', getThresholds);

// 数据总览 - 全局统计和趋势
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
