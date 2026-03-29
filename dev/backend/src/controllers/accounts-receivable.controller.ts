/**
 * 应收账款管理 Controller
 * 实现应收账款数据查询、催收任务管理、审核等业务逻辑
 */

import { Request, Response } from 'express';
import { appQuery } from '../db/appPool';
import { getFileUrl } from '../middleware/upload';
import type { BillDetail } from '../services/accounts-receivable/ar-notification-templates';

// 导入 Service 函数
import {
  getCollectionTasks,
  submitCustomerDelay,
  submitGuaranteeDelay,
  submitPaidOff,
  submitEscalate,
  getCollectionTaskDetail,
} from '../services/accounts-receivable/ar-collection.service';

import {
  getReviewTasks,
  approveReview,
  rejectReview,
  getHistoryRecords,
} from '../services/accounts-receivable/ar-review.service';

import {
  saveSignature,
  getUserSignatures,
} from '../services/accounts-receivable/ar-signature.service';

import {
  sendPendingReviewNotification,
  sendReviewResultNotification,
  sendPaymentConfirmedNotification,
  sendEscalateNotification,
  sendGuaranteeNotification,
} from '../services/accounts-receivable/ar-notification.service';

import { syncArReceivables } from '../services/accounts-receivable';
import { getArStatsWithComparison } from '../services/accounts-receivable/ar-stats.service';

// ==================== 类型定义 ====================

interface AuthenticatedRequest extends Request {
  user: {
    userId: number;
    roles: string[];
    permissions: string[];
    dingtalkUserId: string;
    name: string;
    username?: string;
    realName?: string;
  };
}

// ==================== 辅助函数 ====================

/**
 * 获取当前用户信息
 */
function getCurrentUser(req: Request): AuthenticatedRequest['user'] {
  return (req as any).user;
}

/**
 * 检查用户是否为管理员或财务人员
 */
function isAdminOrFinance(roles: string[]): boolean {
  return roles.some((role) => ['admin', 'finance_staff', 'cashier'].includes(role));
}

/**
 * 构建应收账款查询条件
 */
function buildArWhereClause(queryParams: any[]): { whereClause: string; paramIndex: number } {
  let whereClause = 'WHERE 1=1';
  let paramIndex = 0;

  return { whereClause, paramIndex };
}

// ==================== 数据查询 Controller ====================

/**
 * 获取应收账款列表（分页+筛选）
 * GET /api/ar
 * 权限: finance:ar:read
 */
export const getArList = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const offset = (page - 1) * pageSize;

    const keyword = req.query.keyword as string;
    const status = req.query.status as string;
    const overdueDaysMin = req.query.overdueDaysMin ? parseInt(req.query.overdueDaysMin as string) : undefined;
    const overdueDaysMax = req.query.overdueDaysMax ? parseInt(req.query.overdueDaysMax as string) : undefined;
    const amountMin = req.query.amountMin ? parseFloat(req.query.amountMin as string) : undefined;
    const amountMax = req.query.amountMax ? parseFloat(req.query.amountMax as string) : undefined;
    const sortField = (req.query.sortField as string) || 'due_date';
    const sortOrder = (req.query.sortOrder as string) || 'ASC';

    // 构建 WHERE 条件
    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];

    if (keyword) {
      queryParams.push(`%${keyword}%`);
      whereClause += ` AND (consumer_name ILIKE $${queryParams.length} OR erp_bill_id ILIKE $${queryParams.length})`;
    }

    if (status) {
      queryParams.push(status);
      whereClause += ` AND ar_status = $${queryParams.length}`;
    }

    if (overdueDaysMin !== undefined) {
      queryParams.push(overdueDaysMin);
      whereClause += ` AND COALESCE(CURRENT_DATE - due_date::date, 0) >= $${queryParams.length}`;
    }

    if (overdueDaysMax !== undefined) {
      queryParams.push(overdueDaysMax);
      whereClause += ` AND COALESCE(CURRENT_DATE - due_date::date, 0) <= $${queryParams.length}`;
    }

    if (amountMin !== undefined) {
      queryParams.push(amountMin);
      whereClause += ` AND left_amount >= $${queryParams.length}`;
    }

    if (amountMax !== undefined) {
      queryParams.push(amountMax);
      whereClause += ` AND left_amount <= $${queryParams.length}`;
    }

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM ar_receivables ${whereClause}`;
    const countResult = await appQuery(countSql, queryParams);
    const total = parseInt(countResult.rows[0].total, 10);

    // 查询列表
    const allowedSortFields = ['due_date', 'left_amount', 'total_amount', 'created_at', 'consumer_name'];
    const safeSortField = allowedSortFields.includes(sortField) ? sortField : 'due_date';
    const safeSortOrder = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const listSql = `
      SELECT 
        id,
        erp_bill_id,
        consumer_name,
        consumer_code,
        salesman_name,
        dept_name,
        manager_users,
        settle_method,
        max_debt_days,
        total_amount,
        left_amount,
        paid_amount,
        write_off_amount,
        bill_order_time,
        expire_day,
        last_pay_day,
        due_date,
        ar_status,
        current_collector_id,
        collector_level,
        notification_status,
        last_notified_at,
        last_synced_at,
        created_at,
        updated_at,
        COALESCE(CURRENT_DATE - due_date::date, 0) as overdue_days
      FROM ar_receivables
      ${whereClause}
      ORDER BY ${safeSortField} ${safeSortOrder}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const listResult = await appQuery(listSql, [...queryParams, pageSize, offset]);

    res.json({
      list: listResult.rows,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('获取应收账款列表失败:', error);
    res.status(500).json({
      error: '获取应收账款列表失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取统计概览数据
 * GET /api/ar/stats
 * 权限: finance:ar:read
 * 返回本期统计数据及环比上月变化
 */
export const getArStats = async (req: Request, res: Response) => {
  try {
    const result = await getArStatsWithComparison();
    res.json(result);
  } catch (error) {
    console.error('获取应收账款统计失败:', error);
    res.status(500).json({
      error: '获取应收账款统计失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取账龄分析数据
 * GET /api/ar/aging-analysis
 * 权限: finance:ar:read
 */
export const getArAgingAnalysis = async (req: Request, res: Response) => {
  try {
    const sql = `
      SELECT 
        CASE 
          WHEN due_date IS NULL OR CURRENT_DATE - due_date::date <= 30 THEN '0-30天'
          WHEN CURRENT_DATE - due_date::date <= 60 THEN '31-60天'
          WHEN CURRENT_DATE - due_date::date <= 90 THEN '61-90天'
          ELSE '90天以上'
        END as "range",
        COALESCE(SUM(left_amount), 0) as amount,
        COUNT(*) as count,
        CASE 
          WHEN due_date IS NULL OR CURRENT_DATE - due_date::date <= 30 THEN 1
          WHEN CURRENT_DATE - due_date::date <= 60 THEN 2
          WHEN CURRENT_DATE - due_date::date <= 90 THEN 3
          ELSE 4
        END as sort_order
      FROM ar_receivables
      GROUP BY "range", sort_order
      ORDER BY sort_order
    `;

    const result = await appQuery(sql);

    res.json(result.rows);
  } catch (error) {
    console.error('获取账龄分析数据失败:', error);
    res.status(500).json({
      error: '获取账龄分析数据失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取应收详情+催收历史
 * GET /api/ar/:id
 * 权限: finance:ar:read
 */
export const getArDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const arId = parseInt(id, 10);

    if (isNaN(arId)) {
      res.status(400).json({ error: '参数错误', message: '无效的ID' });
      return;
    }

    // 查询应收账款详情
    const arSql = `
      SELECT 
        r.*,
        COALESCE(CURRENT_DATE - r.due_date::date, 0) as overdue_days,
        u.name as collector_name,
        u.name as collector_real_name
      FROM ar_receivables r
      LEFT JOIN users u ON r.current_collector_id = u.id
      WHERE r.id = $1
    `;
    const arResult = await appQuery(arSql, [arId]);

    if (arResult.rows.length === 0) {
      res.status(404).json({ error: '未找到', message: '应收账款记录不存在' });
      return;
    }

    // 查询关联的催收任务
    const tasksSql = `
      SELECT 
        t.*,
        u.name as collector_name,
        u.name as collector_real_name,
        ru.name as reviewer_name,
        ru.name as reviewer_real_name
      FROM ar_collection_tasks t
      LEFT JOIN users u ON t.collector_id = u.id
      LEFT JOIN users ru ON t.reviewed_by = ru.id
      WHERE t.ar_id = $1
      ORDER BY t.created_at DESC
    `;
    const tasksResult = await appQuery(tasksSql, [arId]);

    // 查询操作日志
    const logsSql = `
      SELECT 
        l.*,
        u.name as action_by_name,
        u.name as action_by_real_name
      FROM ar_action_logs l
      LEFT JOIN users u ON l.action_by = u.id
      WHERE l.ar_id = $1
      ORDER BY l.created_at DESC
    `;
    const logsResult = await appQuery(logsSql, [arId]);

    res.json({
      ...arResult.rows[0],
      tasks: tasksResult.rows,
      logs: logsResult.rows.map((row) => ({
        ...row,
        action_data: row.action_data ? JSON.parse(row.action_data) : null,
      })),
    });
  } catch (error) {
    console.error('获取应收账款详情失败:', error);
    res.status(500).json({
      error: '获取应收账款详情失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取我的催收任务
 * GET /api/ar/my-tasks
 * 权限: finance:ar:collect
 */
export const getMyTasks = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const status = req.query.status as string;

    // 管理员/财务角色查全部，其他只查自己的
    const userId = isAdminOrFinance(user.roles) ? undefined : user.userId;

    const result = await getCollectionTasks({ userId, status, page, pageSize });

    res.json(result);
  } catch (error) {
    console.error('获取催收任务失败:', error);
    res.status(500).json({
      error: '获取催收任务失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取待审核任务列表
 * GET /api/ar/reviews
 * 权限: finance:ar:review
 */
export const getReviews = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const reviewType = req.query.reviewType as string;

    const result = await getReviewTasks({ reviewType, page, pageSize });

    res.json(result);
  } catch (error) {
    console.error('获取待审核任务失败:', error);
    res.status(500).json({
      error: '获取待审核任务失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取已处理记录
 * GET /api/ar/history
 * 权限: finance:ar:read
 */
export const getHistory = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    // 管理员看全部，其他看自己
    const userId = isAdminOrFinance(user.roles) ? undefined : user.userId;

    const result = await getHistoryRecords({ userId, page, pageSize });

    res.json(result);
  } catch (error) {
    console.error('获取历史记录失败:', error);
    res.status(500).json({
      error: '获取历史记录失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取考核记录列表
 * GET /api/ar/penalties
 * 权限: finance:ar:penalty
 */
export const getPenalties = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const penaltyLevel = req.query.penaltyLevel as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // 构建 WHERE 条件
    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];

    if (userId !== undefined) {
      queryParams.push(userId);
      whereClause += ` AND p.user_id = $${queryParams.length}`;
    }

    if (penaltyLevel) {
      queryParams.push(penaltyLevel);
      whereClause += ` AND p.penalty_level = $${queryParams.length}`;
    }

    if (startDate) {
      queryParams.push(startDate);
      whereClause += ` AND DATE(p.created_at) >= $${queryParams.length}`;
    }

    if (endDate) {
      queryParams.push(endDate);
      whereClause += ` AND DATE(p.created_at) <= $${queryParams.length}`;
    }

    // 查询总数
    const countSql = `
      SELECT COUNT(*) as total
      FROM ar_penalty_records p
      ${whereClause}
    `;
    const countResult = await appQuery(countSql, queryParams);
    const total = parseInt(countResult.rows[0].total, 10);

    // 查询列表
    const listSql = `
      SELECT 
        p.*,
        u.name as user_name,
        u.name as user_real_name,
        r.consumer_name,
        r.erp_bill_id
      FROM ar_penalty_records p
      JOIN users u ON p.user_id = u.id
      JOIN ar_receivables r ON p.ar_id = r.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const listResult = await appQuery(listSql, [...queryParams, pageSize, (page - 1) * pageSize]);

    res.json({
      list: listResult.rows,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('获取考核记录失败:', error);
    res.status(500).json({
      error: '获取考核记录失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取我的考核记录
 * GET /api/ar/penalties/my
 * 权限: finance:ar:read
 */
export const getMyPenalties = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    // 查询总数
    const countSql = `
      SELECT COUNT(*) as total
      FROM ar_penalty_records
      WHERE user_id = $1
    `;
    const countResult = await appQuery(countSql, [user.userId]);
    const total = parseInt(countResult.rows[0].total, 10);

    // 查询列表
    const listSql = `
      SELECT 
        p.*,
        r.consumer_name,
        r.erp_bill_id
      FROM ar_penalty_records p
      JOIN ar_receivables r ON p.ar_id = r.id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const listResult = await appQuery(listSql, [user.userId, pageSize, (page - 1) * pageSize]);

    res.json({
      list: listResult.rows,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('获取我的考核记录失败:', error);
    res.status(500).json({
      error: '获取我的考核记录失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取我的历史签名
 * GET /api/ar/signatures
 * 权限: finance:ar:collect
 */
export const getSignatures = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const signatures = await getUserSignatures(user.userId);

    res.json(signatures);
  } catch (error) {
    console.error('获取签名列表失败:', error);
    res.status(500).json({
      error: '获取签名列表失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 保存新签名
 * POST /api/ar/signatures
 * body: { signatureData, isDefault? }
 * 权限: finance:ar:collect
 */
export const createSignature = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { signatureData, isDefault } = req.body;

    if (!signatureData) {
      res.status(400).json({ error: '参数错误', message: '签名数据不能为空' });
      return;
    }

    const result = await saveSignature(user.userId, signatureData, isDefault);

    res.json({ success: true, id: result.id });
  } catch (error) {
    console.error('保存签名失败:', error);
    res.status(500).json({
      error: '保存签名失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 上传凭证图片
 * POST /api/ar/upload-evidence
 * 使用 uploadEvidence.single('file') 中间件
 * 权限: finance:ar:collect
 */
export const uploadEvidenceFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '参数错误', message: '未上传文件' });
      return;
    }

    const url = getFileUrl(req.file.filename);

    res.json({ success: true, url });
  } catch (error) {
    console.error('上传凭证失败:', error);
    res.status(500).json({
      error: '上传凭证失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

// ==================== 操作 Controller ====================

/**
 * 提交催收结果
 * POST /api/ar/:id/collect
 * body: { taskId, resultType, latestPayDate?, evidenceUrl?, signatureData?, escalateReason?, remark? }
 * 权限: finance:ar:collect
 */
export const submitCollectionResult = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { id } = req.params;
    const arId = parseInt(id, 10);

    if (isNaN(arId)) {
      res.status(400).json({ error: '参数错误', message: '无效的ID' });
      return;
    }

    const {
      taskId,
      resultType,
      latestPayDate,
      evidenceUrl,
      signatureData,
      escalateReason,
      remark,
    } = req.body;

    if (!taskId || !resultType) {
      res.status(400).json({ error: '参数错误', message: 'taskId 和 resultType 不能为空' });
      return;
    }

    // 获取任务详情用于通知
    const taskDetail = await getCollectionTaskDetail(taskId);
    const bills: BillDetail[] = [{
      billNo: taskDetail.erp_bill_id,
      amount: taskDetail.owed_amount,
      dueDate: taskDetail.due_date ? new Date(taskDetail.due_date).toISOString().split('T')[0] : '',
    }];

    switch (resultType) {
      case 'customer_delay': {
        if (!latestPayDate || !evidenceUrl) {
          res.status(400).json({ error: '参数错误', message: '客户延期需要提供最晚回款日期和凭证' });
          return;
        }
        await submitCustomerDelay({
          taskId,
          arId,
          collectorId: user.userId,
          latestPayDate: new Date(latestPayDate),
          evidenceUrl,
        });
        // 异步发送待审核通知
        sendPendingReviewNotification({
          arIds: [arId],
          reviewType: '客户延期回款',
          collectorId: user.userId,
          collectorName: user.realName || user.username || '',
          consumerName: taskDetail.consumer_name,
          bills,
        }).catch(console.error);
        break;
      }

      case 'guarantee_delay': {
        if (!latestPayDate || !signatureData) {
          res.status(400).json({ error: '参数错误', message: '担保延期需要提供最晚回款日期和签名' });
          return;
        }
        await submitGuaranteeDelay({
          taskId,
          arId,
          collectorId: user.userId,
          latestPayDate: new Date(latestPayDate),
          signatureData,
        });
        // 异步发送担保通知
        sendGuaranteeNotification({
          arIds: [arId],
          consumerName: taskDetail.consumer_name,
          collectorId: user.userId,
          collectorName: user.realName || user.username || '',
          latestPayDate,
          bills,
        }).catch(console.error);
        break;
      }

      case 'paid_off': {
        await submitPaidOff({
          taskId,
          arId,
          collectorId: user.userId,
          remark,
        });
        // 异步发送待审核通知（出纳核实）
        sendPendingReviewNotification({
          arIds: [arId],
          reviewType: '回款确认',
          collectorId: user.userId,
          collectorName: user.realName || user.username || '',
          consumerName: taskDetail.consumer_name,
          bills,
        }).catch(console.error);
        break;
      }

      case 'escalate': {
        if (!escalateReason) {
          res.status(400).json({ error: '参数错误', message: '升级催收需要提供原因' });
          return;
        }
        const result = await submitEscalate({
          taskId,
          arId,
          collectorId: user.userId,
          escalateReason,
        });
        // 异步发送升级通知
        const overdueDays = taskDetail.due_date
          ? Math.floor((Date.now() - new Date(taskDetail.due_date).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        sendEscalateNotification({
          arIds: [arId],
          consumerName: taskDetail.consumer_name,
          overdueDays,
          reason: escalateReason,
          previousCollectorId: user.userId,
          previousCollectorName: user.realName || user.username || '',
          newCollectorId: result.newTaskId, // 这里需要获取新任务的催收人ID
          bills,
        }).catch(console.error);
        break;
      }

      default:
        res.status(400).json({ error: '参数错误', message: '无效的 resultType' });
        return;
    }

    res.json({ success: true, message: '催收结果提交成功' });
  } catch (error) {
    console.error('提交催收结果失败:', error);
    res.status(500).json({
      error: '提交催收结果失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 财务/出纳审核
 * POST /api/ar/:id/review
 * body: { taskId, action: 'approve'|'reject', comment? }
 * 权限: finance:ar:review
 */
export const reviewTask = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { id } = req.params;
    const arId = parseInt(id, 10);

    if (isNaN(arId)) {
      res.status(400).json({ error: '参数错误', message: '无效的ID' });
      return;
    }

    const { taskId, action, comment } = req.body;

    if (!taskId || !action) {
      res.status(400).json({ error: '参数错误', message: 'taskId 和 action 不能为空' });
      return;
    }

    // 获取任务详情用于通知
    const taskDetail = await getCollectionTaskDetail(taskId);
    const bills: BillDetail[] = [{
      billNo: taskDetail.erp_bill_id,
      amount: taskDetail.owed_amount,
      dueDate: taskDetail.due_date ? new Date(taskDetail.due_date).toISOString().split('T')[0] : '',
    }];

    if (action === 'approve') {
      await approveReview({
        taskId,
        reviewerId: user.userId,
        reviewerName: user.realName || user.username || '',
        reviewComment: comment,
      });

      // 异步发送审核结果通知
      sendReviewResultNotification({
        arIds: [arId],
        consumerName: taskDetail.consumer_name,
        reviewType: taskDetail.result_type === 'paid_off' ? '回款确认' : '客户延期回款',
        approved: true,
        reviewerId: user.userId,
        reviewerName: user.realName || user.username || '',
        collectorId: taskDetail.collector_id,
        bills,
      }).catch(console.error);

      // 如果是出纳核实通过(result_type=paid_off)，额外发送回款确认通知
      if (taskDetail.result_type === 'paid_off') {
        sendPaymentConfirmedNotification({
          arIds: [arId],
          consumerName: taskDetail.consumer_name,
          cashierId: user.userId,
          cashierName: user.realName || user.username || '',
          collectorId: taskDetail.collector_id,
          bills,
        }).catch(console.error);
      }
    } else if (action === 'reject') {
      if (!comment) {
        res.status(400).json({ error: '参数错误', message: '拒绝审核需要提供原因' });
        return;
      }

      await rejectReview({
        taskId,
        reviewerId: user.userId,
        reviewerName: user.realName || user.username || '',
        rejectComment: comment,
      });

      // 异步发送审核结果通知
      sendReviewResultNotification({
        arIds: [arId],
        consumerName: taskDetail.consumer_name,
        reviewType: taskDetail.result_type === 'paid_off' ? '回款确认' : '客户延期回款',
        approved: false,
        reviewerId: user.userId,
        reviewerName: user.realName || user.username || '',
        collectorId: taskDetail.collector_id,
        rejectComment: comment,
        bills,
      }).catch(console.error);
    } else {
      res.status(400).json({ error: '参数错误', message: '无效的 action' });
      return;
    }

    res.json({ success: true, message: '审核操作成功' });
  } catch (error) {
    console.error('审核操作失败:', error);
    res.status(500).json({
      error: '审核操作失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

// ==================== 手动同步 Controller ====================

/**
 * 手动触发ERP数据同步
 * POST /api/ar/sync
 * 权限: finance:ar:manage
 */
export const manualSync = async (req: Request, res: Response) => {
  try {
    console.log('[Controller] 手动触发ERP数据同步...');
    const result = await syncArReceivables();
    console.log('[Controller] ERP数据同步完成:', result);
    res.json({
      code: 200,
      message: '同步完成',
      data: result,
    });
  } catch (error) {
    console.error('手动同步失败:', error);
    res.status(500).json({
      code: 500,
      message: '同步失败',
    });
  }
};
