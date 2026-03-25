import { Router } from 'express';
import { healthCheck, getDashboard, getWarningProductsController, getCategoryTreeController, getCategoryOutOfStockController } from '../controllers/dashboard.controller';

const router = Router();

// 健康检查
router.get('/health', healthCheck);

// Dashboard 数据
router.get('/dashboard', getDashboard);

// 预警商品列表
router.get('/warnings/:type', getWarningProductsController);

// 品类库存齐全率相关
router.get('/availability/category-tree', getCategoryTreeController);
router.get('/availability/out-of-stock', getCategoryOutOfStockController);

export default router;
