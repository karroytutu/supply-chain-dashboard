/**
 * 应收看板路由
 * 3 个只读 GET 接口，权限 ar:collection:read
 */
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  handleOverview,
  handleUpcomingExpiry,
  handlePipelineExpiry,
} from '../controllers/ar-dashboard.controller';

const router = Router();

router.use(authMiddleware);
router.use(requirePermission('ar:collection:read'));

/** 看板主数据 */
router.get('/overview', handleOverview);

/** 即将逾期客户弹窗 */
router.get('/upcoming-expiry', handleUpcomingExpiry);

/** 管道节点即将逾期弹窗 */
router.get('/pipeline-expiry', handlePipelineExpiry);

export default router;
