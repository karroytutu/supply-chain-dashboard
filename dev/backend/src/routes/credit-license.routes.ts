/**
 * 客户授信营业执照后补上传 - 路由定义
 * @module routes/credit-license.routes
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { uploadCreditLicense } from '../middleware/credit-upload';
import {
  supplementLicenseController,
  listMyDeferredUploadsController,
  listDeferredUploadsController,
  getDeferredByInstanceController,
} from '../controllers/credit-license.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// ==================== 补交操作 ====================

/** 补交营业执照（营销员操作） */
router.post(
  '/:instanceId/supplement-license',
  requirePermission('oa:write'),
  uploadCreditLicense.array('files', 3),
  supplementLicenseController
);

// ==================== 查询 ====================

/** 根据审批实例ID查询延期补交记录 */
router.get(
  '/instance/:instanceId',
  requirePermission('oa:read'),
  getDeferredByInstanceController
);

/** 营销员查看自己的待补交列表 */
router.get(
  '/my',
  requirePermission('oa:read'),
  listMyDeferredUploadsController
);

/** 管理视图：查询所有延期补交记录 */
router.get(
  '/',
  requirePermission('finance:ar:penalty:read'),
  listDeferredUploadsController
);

export default router;
