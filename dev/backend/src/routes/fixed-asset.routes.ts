/**
 * 固定资产路由
 * @module routes/fixed-asset.routes
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  searchAssets,
  getAssetDetail,
  getCategories,
  getStaff,
  getDepartments,
  getPaymentAccounts,
  listApplications,
  getApplicationDetail,
} from '../controllers/fixed-asset-query.controller';
import {
  create,
  retry,
} from '../controllers/fixed-asset-mutation.controller';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// =====================================================
// 舟谱 ERP 代理查询接口（需要 asset:read 权限）
// 注意：具体路径必须放在 /:erpAssetId 之前，避免参数路由拦截
// =====================================================

router.get('/search', requirePermission('asset:read'), searchAssets);
router.get('/categories', requirePermission('asset:read'), getCategories);
router.get('/staff', requirePermission('asset:read'), getStaff);
router.get('/departments', requirePermission('asset:read'), getDepartments);
router.get('/payment-accounts', requirePermission('asset:read'), getPaymentAccounts);

// =====================================================
// 申请列表与详情（需要 asset:read 权限）
// =====================================================

router.get('/purchase/applications', requirePermission('asset:read'), listApplications);
router.get('/transfer/applications', requirePermission('asset:read'), listApplications);
router.get('/maintenance/applications', requirePermission('asset:read'), listApplications);
router.get('/disposal/applications', requirePermission('asset:read'), listApplications);
router.get('/applications/:id', requirePermission('asset:read'), getApplicationDetail);

// =====================================================
// 舟谱资产详情（参数路由放最后）
// =====================================================

router.get('/:erpAssetId', requirePermission('asset:read'), getAssetDetail);

// =====================================================
// 创建申请（需要 asset:write 权限）
// =====================================================

router.post('/purchase', requirePermission('asset:write'), create);
router.post('/transfer', requirePermission('asset:write'), create);
router.post('/maintenance', requirePermission('asset:write'), create);
router.post('/disposal', requirePermission('asset:write'), create);

// =====================================================
// 重试 ERP 操作（需要 asset:data_input 权限）
// =====================================================

router.post('/applications/:id/retry', requirePermission('asset:data_input'), retry);

export default router;
