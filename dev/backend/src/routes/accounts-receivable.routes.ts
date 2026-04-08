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
  // 客户维度催收任务
  getCustomerTasksList,
  getCustomerTask,
  submitCustomerCollectResult,
  submitCustomerCollectBatch,
  quickDelayCustomerTaskAction,
  escalateCustomerTaskAction,
  // 客户维度审核
  getCustomerReviewList,
  reviewCustomerTask,
  getCustomerHistory,
  // 逾期管理
  getOverdueStatsHandler,
  getPreprocessingListHandler,
  startPreprocessingHandler,
  completePreprocessingHandler,
  getPreprocessingTaskBillsHandler,
  markVoucherStatusHandler,
  batchMarkVoucherStatusHandler,
  getAssignmentListHandler,
  assignTaskHandler,
  getDeadlineConfigsHandler,
  updateDeadlineConfigHandler,
  getTimeoutWarningsHandler,
  getTimeEfficiencyHandler,
  getCustomerOverdueHandler,
  getPerformanceHandler,
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

// ==================== 客户维度催收任务 ====================

/**
 * 获取客户催收任务列表
 * GET /api/ar/customer-tasks
 * 权限: finance:ar:collect
 */
router.get(
  '/customer-tasks',
  requirePermission('finance:ar:collect'),
  getCustomerTasksList
);

/**
 * 获取客户催收任务详情
 * GET /api/ar/customer-tasks/:id
 * 权限: finance:ar:collect
 */
router.get(
  '/customer-tasks/:id',
  requirePermission('finance:ar:collect'),
  getCustomerTask
);

/**
 * 提交客户催收结果（统一操作）
 * POST /api/ar/customer-tasks/:id/collect
 * 权限: finance:ar:collect
 */
router.post(
  '/customer-tasks/:id/collect',
  requirePermission('finance:ar:collect'),
  submitCustomerCollectResult
);

/**
 * 提交客户催收结果（混合操作）
 * POST /api/ar/customer-tasks/:id/collect-batch
 * 权限: finance:ar:collect
 */
router.post(
  '/customer-tasks/:id/collect-batch',
  requirePermission('finance:ar:collect'),
  submitCustomerCollectBatch
);

/**
 * 客户任务快速延期
 * POST /api/ar/customer-tasks/:id/quick-delay
 * 权限: finance:ar:collect
 */
router.post(
  '/customer-tasks/:id/quick-delay',
  requirePermission('finance:ar:collect'),
  quickDelayCustomerTaskAction
);

/**
 * 客户任务升级
 * POST /api/ar/customer-tasks/:id/escalate
 * 权限: finance:ar:collect
 */
router.post(
  '/customer-tasks/:id/escalate',
  requirePermission('finance:ar:collect'),
  escalateCustomerTaskAction
);

// ==================== 客户维度审核 ====================

/**
 * 获取客户维度待审核任务
 * GET /api/ar/customer-review
 * 权限: finance:ar:review
 */
router.get(
  '/customer-review',
  requirePermission('finance:ar:review'),
  getCustomerReviewList
);

/**
 * 客户任务审核
 * POST /api/ar/customer-review/:id/review
 * 权限: finance:ar:review
 */
router.post(
  '/customer-review/:id/review',
  requirePermission('finance:ar:review'),
  reviewCustomerTask
);

/**
 * 获取客户维度历史记录
 * GET /api/ar/customer-history
 * 权限: finance:ar:read
 */
router.get(
  '/customer-history',
  requirePermission('finance:ar:read'),
  getCustomerHistory
);

// ==================== 逾期管理路由 ====================

/**
 * 获取逾期统计
 * GET /api/ar/overdue/stats
 * 权限: finance:ar:overdue:read
 */
router.get(
  '/overdue/stats',
  requirePermission('finance:ar:overdue:read'),
  getOverdueStatsHandler
);

/**
 * 获取待预处理列表
 * GET /api/ar/overdue/preprocessing
 * 权限: finance:ar:overdue:preprocess
 */
router.get(
  '/overdue/preprocessing',
  requirePermission('finance:ar:overdue:preprocess'),
  getPreprocessingListHandler
);

/**
 * 开始预处理
 * POST /api/ar/overdue/preprocessing/start
 * 权限: finance:ar:overdue:preprocess
 */
router.post(
  '/overdue/preprocessing/start',
  requirePermission('finance:ar:overdue:preprocess'),
  startPreprocessingHandler
);

/**
 * 完成预处理
 * POST /api/ar/overdue/preprocessing/complete
 * 权限: finance:ar:overdue:preprocess
 */
router.post(
  '/overdue/preprocessing/complete',
  requirePermission('finance:ar:overdue:preprocess'),
  completePreprocessingHandler
);

/**
 * 获取预处理任务关联的订单明细
 * GET /api/ar/overdue/preprocessing/:taskId/bills
 * 权限: finance:ar:overdue:preprocess
 */
router.get(
  '/overdue/preprocessing/:taskId/bills',
  requirePermission('finance:ar:overdue:preprocess'),
  getPreprocessingTaskBillsHandler
);

/**
 * 标记单据凭证状态
 * POST /api/ar/overdue/preprocessing/:taskId/voucher-mark
 * 权限: finance:ar:overdue:preprocess
 */
router.post(
  '/overdue/preprocessing/:taskId/voucher-mark',
  requirePermission('finance:ar:overdue:preprocess'),
  markVoucherStatusHandler
);

/**
 * 批量标记凭证状态
 * POST /api/ar/overdue/preprocessing/:taskId/voucher-mark/batch
 * 权限: finance:ar:overdue:preprocess
 */
router.post(
  '/overdue/preprocessing/:taskId/voucher-mark/batch',
  requirePermission('finance:ar:overdue:preprocess'),
  batchMarkVoucherStatusHandler
);

/**
 * 获取待分配列表
 * GET /api/ar/overdue/assignment
 * 权限: finance:ar:overdue:assign
 */
router.get(
  '/overdue/assignment',
  requirePermission('finance:ar:overdue:assign'),
  getAssignmentListHandler
);

/**
 * 分配任务
 * POST /api/ar/overdue/assignment/assign
 * 权限: finance:ar:overdue:assign
 */
router.post(
  '/overdue/assignment/assign',
  requirePermission('finance:ar:overdue:assign'),
  assignTaskHandler
);

/**
 * 获取时限配置
 * GET /api/ar/overdue/deadline-configs
 * 权限: finance:ar:overdue:read
 */
router.get(
  '/overdue/deadline-configs',
  requirePermission('finance:ar:overdue:read'),
  getDeadlineConfigsHandler
);

/**
 * 更新时限配置
 * PUT /api/ar/overdue/deadline-configs/:id
 * 权限: finance:ar:overdue:config
 */
router.put(
  '/overdue/deadline-configs/:id',
  requirePermission('finance:ar:overdue:config'),
  updateDeadlineConfigHandler
);

/**
 * 获取超时预警列表
 * GET /api/ar/overdue/timeout-warnings
 * 权限: finance:ar:overdue:read
 */
router.get(
  '/overdue/timeout-warnings',
  requirePermission('finance:ar:overdue:read'),
  getTimeoutWarningsHandler
);

/**
 * 获取时效分析
 * GET /api/ar/overdue/time-efficiency
 * 权限: finance:ar:efficiency:read
 */
router.get(
  '/overdue/time-efficiency',
  requirePermission('finance:ar:efficiency:read'),
  getTimeEfficiencyHandler
);

/**
 * 获取客户逾期列表
 * GET /api/ar/overdue/customers
 * 权限: finance:ar:customer:read
 */
router.get(
  '/overdue/customers',
  requirePermission('finance:ar:customer:read'),
  getCustomerOverdueHandler
);

/**
 * 获取绩效统计
 * GET /api/ar/overdue/performance
 * 权限: finance:ar:performance:read
 */
router.get(
  '/overdue/performance',
  requirePermission('finance:ar:performance:read'),
  getPerformanceHandler
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
