/**
 * OA审批路由
 * @module routes/oa-approval.routes
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  // 表单类型
  listFormTypes,
  listFormTypesGrouped,
  getFormType,
  // 审批实例
  listApprovals,
  getStats,
  getDetail,
  submit,
  approve,
  reject,
  transfer,
  countersign,
  withdraw,
  // 数据管理
  getDataList,
  exportData,
  // 站内消息
  listMessages,
  getUnreadCount,
  readMessage,
  readAllMessages,
} from '../controllers/oa-approval.controller';

const router = Router();

// =====================================================
// 所有路由都需要认证
// =====================================================
router.use(authMiddleware);

// =====================================================
// 表单类型接口
// =====================================================

// 获取所有表单类型
router.get('/form-types', listFormTypes);

// 获取按分类分组的表单类型
router.get('/form-types/grouped', listFormTypesGrouped);

// 获取单个表单类型
router.get('/form-types/:code', getFormType);

// =====================================================
// 审批实例接口
// =====================================================

// 获取审批统计
router.get('/instances/stats', getStats);

// 获取审批列表
router.get('/instances', listApprovals);

// 获取审批详情
router.get('/instances/:id', getDetail);

// 提交审批
router.post('/instances', submit);

// 同意审批
router.post('/instances/:id/approve', approve);

// 拒绝审批
router.post('/instances/:id/reject', reject);

// 转交审批
router.post('/instances/:id/transfer', transfer);

// 加签
router.post('/instances/:id/countersign', countersign);

// 撤回审批
router.post('/instances/:id/withdraw', withdraw);

// =====================================================
// 数据管理接口
// =====================================================

// 获取数据列表
router.get('/data', getDataList);

// 导出数据
router.get('/data/export', exportData);

// =====================================================
// 站内消息接口
// =====================================================

// 获取未读消息数量
router.get('/messages/unread-count', getUnreadCount);

// 获取消息列表
router.get('/messages', listMessages);

// 标记消息已读
router.post('/messages/:id/read', readMessage);

// 标记所有消息已读
router.post('/messages/read-all', readAllMessages);

export default router;
