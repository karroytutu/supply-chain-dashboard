/**
 * 退货单管理路由
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { uploadReturnEvidence } from '../middleware/return-evidence-upload';
import {
  getReturnOrdersController,
  getReturnOrderByIdController,
  getReturnOrderStatsController,
  getPendingErpOrdersController,
  getReturnOrderActionsController,
  batchConfirmReturnOrdersController,
  cancelReturnOrderController,
  fillErpReturnNoController,
  warehouseExecuteController,
  uploadReturnEvidenceController,
  marketingSaleCompleteController,
  triggerSyncController,
  rollbackReturnOrderController,
} from '../controllers/return-order.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// 获取退货单列表
router.get(
  '/',
  requirePermission('return:read'),
  getReturnOrdersController
);

// 获取退货单统计
router.get(
  '/stats',
  requirePermission('return:read'),
  getReturnOrderStatsController
);

// 获取待填写ERP退货单列表
router.get(
  '/pending-erp',
  requirePermission('return:read'),
  getPendingErpOrdersController
);

// 手动触发同步
router.post(
  '/sync',
  requirePermission('return:write'),
  triggerSyncController
);

// 上传退货凭证图片（支持多文件，最多9张）
router.post(
  '/upload-evidence',
  requirePermission('return:write'),
  uploadReturnEvidence.array('files', 9),
  uploadReturnEvidenceController
);

// 获取退货单详情
router.get(
  '/:id',
  requirePermission('return:read'),
  getReturnOrderByIdController
);

// 获取退货单操作记录
router.get(
  '/:id/actions',
  requirePermission('return:read'),
  getReturnOrderActionsController
);

// 批量确认退货单
router.post(
  '/batch-confirm',
  requirePermission('return:write'),
  batchConfirmReturnOrdersController
);

// 取消退货单
router.post(
  '/:id/cancel',
  requirePermission('return:write'),
  cancelReturnOrderController
);

// 填写ERP退货单号
router.post(
  '/:id/erp-fill',
  requirePermission('return:write'),
  fillErpReturnNoController
);

// 仓储执行退货
router.post(
  '/:id/warehouse',
  requirePermission('return:write'),
  warehouseExecuteController
);

// 营销销售完成处理
router.post(
  '/:id/marketing',
  requirePermission('return:write'),
  marketingSaleCompleteController
);

// 回退退货单
router.post(
  '/:id/rollback',
  requirePermission('return:write'),
  rollbackReturnOrderController
);

export default router;
