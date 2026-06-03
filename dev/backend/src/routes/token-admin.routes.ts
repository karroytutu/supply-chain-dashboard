/**
 * Token 管理 - 路由定义
 * @module routes/token-admin.routes
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import {
  getTokenStatusController,
  getTokenLogsController,
  triggerErpLoginController,
  triggerWmsLoginController,
  submitWmsSmsCodeController,
  triggerB2bExchangeController,
  verifyErpTokenController,
  verifyWmsTokenController,
  verifyB2bTokenController,
} from '../controllers/token-admin.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// ==================== 查询（system:token:read） ====================

/** 获取三系统 Token 状态 */
router.get('/status', requirePermission('system:token:read'), getTokenStatusController);

/** 获取操作日志（分页） */
router.get('/logs', requirePermission('system:token:read'), getTokenLogsController);

/** 验证 ERP Token 有效性 */
router.post('/erp/verify', requirePermission('system:token:read'), verifyErpTokenController);

/** 验证 WMS Token 有效性 */
router.post('/wms/verify', requirePermission('system:token:read'), verifyWmsTokenController);

/** 验证 B2B Token 有效性 */
router.post('/b2b/verify', requirePermission('system:token:read'), verifyB2bTokenController);

// ==================== 操作（system:token:write） ====================

/** 触发 ERP 登录（异步，浏览器操作耗时约 30s） */
router.post('/erp/login', requirePermission('system:token:write'), triggerErpLoginController);

/** 触发 WMS 登录（可能返回 needsSms=true，需要二次提交验证码） */
router.post('/wms/login', requirePermission('system:token:write'), triggerWmsLoginController);

/** 提交 WMS 短信验证码 */
router.post('/wms/sms-code', requirePermission('system:token:write'), submitWmsSmsCodeController);

/** 触发 B2B Token 兑换 */
router.post('/b2b/exchange', requirePermission('system:token:write'), triggerB2bExchangeController);

export default router;
