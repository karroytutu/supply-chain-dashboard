/**
 * 应收账款管理路由
 * 实现应收账款数据查询、催收任务管理、审核等API端点
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { uploadEvidence } from '../middleware/upload';

import {
  // 数据查询
  getArList,
  getArStats,
  getArAgingAnalysis,
  getArDetail,
  getMyTasks,
  getAllTasks,
  getPreWarning,
  getReviews,
  getHistory,
  // 考核
  getPenalties,
  getMyPenalties,
  // 签名
  getSignatures,
  createSignature,
  // 文件上传
  uploadEvidenceFile,
  // 操作
  submitCollectionResult,
  reviewTask,
  // 手动同步
  manualSync,
  // 推送记录
  getArNotifications,
} from '../controllers/accounts-receivable.controller';

const router = Router();

// 所有路由需要认证
router.use(authMiddleware);

// ==================== 应收账款数据查询 ====================

/**
 * 获取应收账款列表（分页+筛选）
 * GET /api/ar
 * 权限: finance:ar:read
 */
router.get(
  '/',
  requirePermission('finance:ar:read'),
  getArList
);

/**
 * 获取统计概览数据
 * GET /api/ar/stats
 * 权限: finance:ar:read
 */
router.get(
  '/stats',
  requirePermission('finance:ar:read'),
  getArStats
);

/**
 * 手动触发ERP数据同步
 * POST /api/ar/sync
 * 权限: finance:ar:manage
 */
router.post(
  '/sync',
  requirePermission('finance:ar:manage'),
  manualSync
);

/**
 * 获取账龄分析数据
 * GET /api/ar/aging-analysis
 * 权限: finance:ar:read
 */
router.get(
  '/aging-analysis',
  requirePermission('finance:ar:read'),
  getArAgingAnalysis
);

// ==================== 催收任务 ====================

/**
 * 获取我的催收任务
 * GET /api/ar/my-tasks
 * 权限: finance:ar:collect
 */
router.get(
  '/my-tasks',
  requirePermission('finance:ar:collect'),
  getMyTasks
);

/**
 * 获取所有催收任务（管理员视角）
 * GET /api/ar/all-tasks
 * 权限: finance:ar:manage
 */
router.get(
  '/all-tasks',
  requirePermission('finance:ar:manage'),
  getAllTasks
);

/**
 * 获取逾期前预警数据（管理员视角）
 * GET /api/ar/pre-warning
 * 权限: finance:ar:manage
 */
router.get(
  '/pre-warning',
  requirePermission('finance:ar:manage'),
  getPreWarning
);

/**
 * 获取待审核任务列表
 * GET /api/ar/reviews
 * 权限: finance:ar:review
 */
router.get(
  '/reviews',
  requirePermission('finance:ar:review'),
  getReviews
);

/**
 * 获取已处理记录
 * GET /api/ar/history
 * 权限: finance:ar:read
 */
router.get(
  '/history',
  requirePermission('finance:ar:read'),
  getHistory
);

// ==================== 考核 ====================

/**
 * 获取考核记录列表
 * GET /api/ar/penalties
 * 权限: finance:ar:penalty
 */
router.get(
  '/penalties',
  requirePermission('finance:ar:penalty'),
  getPenalties
);

/**
 * 获取我的考核记录
 * GET /api/ar/penalties/my
 * 权限: finance:ar:read
 */
router.get(
  '/penalties/my',
  requirePermission('finance:ar:read'),
  getMyPenalties
);

// ==================== 签名 ====================

/**
 * 获取我的历史签名
 * GET /api/ar/signatures
 * 权限: finance:ar:collect
 */
router.get(
  '/signatures',
  requirePermission('finance:ar:collect'),
  getSignatures
);

/**
 * 保存新签名
 * POST /api/ar/signatures
 * 权限: finance:ar:collect
 */
router.post(
  '/signatures',
  requirePermission('finance:ar:collect'),
  createSignature
);

// ==================== 文件上传 ====================

/**
 * 上传凭证图片
 * POST /api/ar/upload-evidence
 * 权限: finance:ar:collect
 */
router.post(
  '/upload-evidence',
  requirePermission('finance:ar:collect'),
  uploadEvidence.single('file'),
  uploadEvidenceFile
);

// ==================== 详情（放在参数路由之前）====================

/**
 * 获取应收账款的推送历史记录
 * GET /api/ar/:id/notifications
 * 权限: finance:ar:read
 * 注意：此路由必须在 /:id 之前，否则会被 /:id 匹配
 */
router.get(
  '/:id/notifications',
  requirePermission('finance:ar:read'),
  getArNotifications
);

/**
 * 获取应收详情+催收历史
 * GET /api/ar/:id
 * 权限: finance:ar:read
 */
router.get(
  '/:id',
  requirePermission('finance:ar:read'),
  getArDetail
);

// ==================== 催收和审核操作 ====================

/**
 * 提交催收结果
 * POST /api/ar/:id/collect
 * 权限: finance:ar:collect
 */
router.post(
  '/:id/collect',
  requirePermission('finance:ar:collect'),
  submitCollectionResult
);

/**
 * 财务/出纳审核
 * POST /api/ar/:id/review
 * 权限: finance:ar:review
 */
router.post(
  '/:id/review',
  requirePermission('finance:ar:review'),
  reviewTask
);

export default router;
