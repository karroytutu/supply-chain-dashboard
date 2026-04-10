/**
 * 催收管理路由
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { uploadEvidence } from '../middleware/upload';
import * as controller from '../controllers/ar-collection.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// ============================================
// 查询路由 - 需要 read 权限
// ============================================

// 获取催收统计概览
router.get('/stats', requirePermission('ar:collection:read'), controller.getStats);

// 获取我的待办（放在 /tasks/:id 之前，避免被误匹配）
router.get('/my-tasks', requirePermission('ar:collection:read'), controller.getMyTasks);

// 获取处理人列表
router.get('/handlers', requirePermission('ar:collection:read'), controller.getHandlers);

// 获取催收任务列表
router.get('/tasks', requirePermission('ar:collection:read'), controller.getTasks);

// 获取单个任务详情
router.get('/tasks/:id', requirePermission('ar:collection:read'), controller.getTaskById);

// 获取任务关联的欠款明细
router.get('/tasks/:id/details', requirePermission('ar:collection:read'), controller.getTaskDetails);

// 获取操作历史
router.get('/tasks/:id/actions', requirePermission('ar:collection:read'), controller.getTaskActions);

// 获取法律催收进展
router.get('/tasks/:id/legal-progress', requirePermission('ar:collection:read'), controller.getLegalProgress);

// ============================================
// 操作路由 - 需要 write 权限
// ============================================

// 核销回款申请
router.post('/tasks/:id/verify', requirePermission('ar:collection:write'), controller.submitVerify);

// 申请延期
router.post('/tasks/:id/extension', requirePermission('ar:collection:write'), controller.applyExtension);

// 标记差异
router.post('/tasks/:id/difference', requirePermission('ar:collection:write'), controller.markDifference);

// ============================================
// 升级路由 - 需要 escalate 权限
// ============================================

// 升级处理
router.post('/tasks/:id/escalate', requirePermission('ar:collection:escalate'), controller.escalateTask);

// ============================================
// 核销确认路由 - 需要 verify 权限
// ============================================

// 出纳确认核销
router.post('/tasks/:id/confirm-verify', requirePermission('ar:collection:verify'), controller.confirmVerify);

// ============================================
// 财务/法律操作路由 - 需要 write 权限
// ============================================

// 差异解决
router.post('/tasks/:id/resolve-difference', requirePermission('ar:collection:write'), controller.resolveDifference);

// 发送催收函
router.post('/tasks/:id/send-notice', requirePermission('ar:collection:write'), controller.sendNotice);

// 提起诉讼
router.post('/tasks/:id/file-lawsuit', requirePermission('ar:collection:write'), controller.fileLawsuit);

// 更新法律进展
router.post('/tasks/:id/update-legal-progress', requirePermission('ar:collection:write'), controller.updateLegalProgress);

// ============================================
// 上传路由
// ============================================

// 上传凭证文件
router.post('/upload', requirePermission('ar:collection:write'), uploadEvidence.single('file'), controller.uploadEvidence);

// ============================================
// 预警查询路由 - 需要 read 权限
// ============================================

// 获取即将逾期预警数据
router.get('/warnings/upcoming', requirePermission('ar:collection:read'), controller.getWarnings);

// 获取预警提醒历史记录
router.get('/warnings/reminders', requirePermission('ar:collection:read'), controller.getReminders);

export default router;
