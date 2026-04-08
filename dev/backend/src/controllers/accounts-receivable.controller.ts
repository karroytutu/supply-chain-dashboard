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
  getCustomerReviewTasks,
  approveCustomerTaskReview,
  rejectCustomerTaskReview,
  getCustomerHistoryRecords,
} from '../services/accounts-receivable/ar-review.service';

import {
  getCustomerTasks,
  getCustomerTaskDetail,
  submitUnifiedResult,
  submitMixedResults,
  escalateCustomerTask,
  quickDelayCustomerTask,
} from '../services/accounts-receivable/ar-customer-task.service';

import {
  saveSignature,
  getUserSignatures,
} from '../services/accounts-receivable/ar-signature.service';

import type { CollectionTaskStatus } from '../services/accounts-receivable/ar.types';

import {
  getPreWarningData,
} from '../services/accounts-receivable/ar-stats.service';

import {
  sendPendingReviewNotification,
  sendReviewResultNotification,
  sendPaymentConfirmedNotification,
  sendEscalateNotification,
  sendGuaranteeNotification,
  getNotificationRecordsByArId,
} from '../services/accounts-receivable/ar-notification.service';

import { syncArReceivables } from '../services/accounts-receivable';
import { getArStatsWithComparison } from '../services/accounts-receivable/ar-stats.service';

// 导入逾期管理服务
import {
  getOverdueStats,
  getPreprocessingList,
  startPreprocessing,
  completePreprocessing,
  getPreprocessingTaskBills,
  getAssignmentList,
  assignTask,
  getDeadlineConfigs,
  updateDeadlineConfig,
  getTimeoutWarnings,
} from '../services/accounts-receivable';

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
        order_no,
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
    
    // 查询通知推送记录
    const notifySql = `
      SELECT
        n.id,
        n.ar_ids,
        n.notification_type,
        n.recipient_id,
        n.recipient_name,
        n.consumer_name,
        n.bill_count,
        n.status,
        n.sent_at,
        n.created_at
      FROM ar_notification_records n
      WHERE $1 = ANY(n.ar_ids)
      ORDER BY n.created_at DESC
    `;
    const notifyResult = await appQuery(notifySql, [arId]);
    
    // 合并操作日志和通知记录
    const actionLogs = [
      // 操作日志
      ...logsResult.rows.map((row) => ({
        id: row.id,
        source: 'action',
        action_type: row.action_type,
        operator_id: row.action_by,
        operator_name: row.action_by_name,
        created_at: row.created_at,
        details: row.action_data ? JSON.parse(row.action_data) : null,
      })),
      // 通知推送记录
      ...notifyResult.rows.map((row) => ({
        id: `notify-${row.id}`,
        source: 'notification',
        action_type: row.notification_type,
        operator_id: row.recipient_id,
        operator_name: row.recipient_name,
        created_at: row.sent_at || row.created_at,
        details: {
          status: row.status,
          consumer_name: row.consumer_name,
          bill_count: row.bill_count,
        },
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    res.json({
      receivable: arResult.rows[0],
      tasks: tasksResult.rows,
      actionLogs,
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
 * 获取所有催收任务（管理员视角）
 * GET /api/ar/all-tasks
 * 权限: finance:ar:manage
 */
export const getAllTasks = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const status = req.query.status as string;
    const keyword = req.query.keyword as string;

    // 不传 userId，查询全部任务
    const result = await getCollectionTasks({ status, page, pageSize });

    // 如果有关键词搜索，进行过滤
    if (keyword && result.list.length > 0) {
      result.list = result.list.filter(
        (task: any) =>
          task.consumer_name?.includes(keyword) ||
          task.collector_name?.includes(keyword)
      );
      result.total = result.list.length;
    }

    res.json(result);
  } catch (error) {
    console.error('获取所有催收任务失败:', error);
    res.status(500).json({
      error: '获取所有催收任务失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取逾期前预警数据（管理员视角）
 * GET /api/ar/pre-warning
 * 权限: finance:ar:manage
 */
export const getPreWarning = async (req: Request, res: Response) => {
  try {
    const result = await getPreWarningData();
    res.json(result);
  } catch (error) {
    console.error('获取逾期前预警数据失败:', error);
    res.status(500).json({
      error: '获取逾期前预警数据失败',
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

// ==================== 推送记录查询 Controller ====================

/**
 * 获取应收账款的推送历史记录
 * GET /api/ar/:id/notifications
 * 权限: finance:ar:read
 */
export const getArNotifications = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const arId = parseInt(id, 10);

    if (isNaN(arId)) {
      res.status(400).json({ error: '参数错误', message: '无效的ID' });
      return;
    }

    const records = await getNotificationRecordsByArId(arId);

    res.json({
      code: 200,
      data: records,
    });
  } catch (error) {
    console.error('获取推送记录失败:', error);
    res.status(500).json({
      error: '获取推送记录失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

// ==================== 客户维度催收任务 Controller ====================

/**
 * 获取客户催收任务列表
 * GET /api/ar/customer-tasks
 * 权限: finance:ar:collect
 */
export const getCustomerTasksList = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { status, keyword, page, pageSize } = req.query;

    // 非管理员只能看自己的任务
    const userId = isAdminOrFinance(user.roles) ? undefined : user.userId;

    const result = await getCustomerTasks({
      userId,
      status: status as CollectionTaskStatus | undefined,
      keyword: keyword as string,
      page: page ? parseInt(page as string, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : 20,
    });

    res.json({
      code: 200,
      data: result,
    });
  } catch (error) {
    console.error('获取客户催收任务列表失败:', error);
    res.status(500).json({
      error: '获取任务列表失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取客户催收任务详情
 * GET /api/ar/customer-tasks/:id
 * 权限: finance:ar:collect
 */
export const getCustomerTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const taskId = parseInt(id, 10);

    if (isNaN(taskId)) {
      res.status(400).json({ error: '参数错误', message: '无效的任务ID' });
      return;
    }

    const detail = await getCustomerTaskDetail(taskId);

    res.json({
      code: 200,
      data: detail,
    });
  } catch (error) {
    console.error('获取客户任务详情失败:', error);
    res.status(500).json({
      error: '获取任务详情失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 提交客户催收结果（统一操作）
 * POST /api/ar/customer-tasks/:id/collect
 * 权限: finance:ar:collect
 */
export const submitCustomerCollectResult = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { id } = req.params;
    const customerTaskId = parseInt(id, 10);

    if (isNaN(customerTaskId)) {
      res.status(400).json({ error: '参数错误', message: '无效的任务ID' });
      return;
    }

    const { resultType, latestPayDate, evidenceUrl, signatureData, escalateReason, remark } = req.body;

    if (!resultType) {
      res.status(400).json({ error: '参数错误', message: 'resultType 不能为空' });
      return;
    }

    await submitUnifiedResult({
      customerTaskId,
      collectorId: user.userId,
      resultType,
      latestPayDate: latestPayDate ? new Date(latestPayDate) : undefined,
      evidenceUrl,
      signatureData,
      escalateReason,
      remark,
    });

    res.json({ success: true, message: '催收结果提交成功' });
  } catch (error) {
    console.error('提交客户催收结果失败:', error);
    res.status(500).json({
      error: '提交失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 提交客户催收结果（混合操作）
 * POST /api/ar/customer-tasks/:id/collect-batch
 * 权限: finance:ar:collect
 */
export const submitCustomerCollectBatch = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { id } = req.params;
    const customerTaskId = parseInt(id, 10);

    if (isNaN(customerTaskId)) {
      res.status(400).json({ error: '参数错误', message: '无效的任务ID' });
      return;
    }

    const { bills, evidenceUrl, signatureData } = req.body;

    if (!bills || !Array.isArray(bills) || bills.length === 0) {
      res.status(400).json({ error: '参数错误', message: 'bills 不能为空' });
      return;
    }

    await submitMixedResults({
      customerTaskId,
      collectorId: user.userId,
      bills,
      evidenceUrl,
      signatureData,
    });

    res.json({ success: true, message: '催收结果提交成功' });
  } catch (error) {
    console.error('提交混合催收结果失败:', error);
    res.status(500).json({
      error: '提交失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 客户任务快速延期
 * POST /api/ar/customer-tasks/:id/quick-delay
 * 权限: finance:ar:collect
 */
export const quickDelayCustomerTaskAction = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { id } = req.params;
    const customerTaskId = parseInt(id, 10);
    const { days } = req.body;

    if (isNaN(customerTaskId) || !days) {
      res.status(400).json({ error: '参数错误', message: '参数不完整' });
      return;
    }

    await quickDelayCustomerTask({
      customerTaskId,
      collectorId: user.userId,
      days: parseInt(days, 10),
    });

    res.json({ success: true, message: '延期成功' });
  } catch (error) {
    console.error('快速延期失败:', error);
    res.status(500).json({
      error: '延期失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 客户任务升级
 * POST /api/ar/customer-tasks/:id/escalate
 * 权限: finance:ar:collect
 */
export const escalateCustomerTaskAction = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { id } = req.params;
    const customerTaskId = parseInt(id, 10);
    const { escalateReason } = req.body;

    if (isNaN(customerTaskId) || !escalateReason) {
      res.status(400).json({ error: '参数错误', message: '参数不完整' });
      return;
    }

    const result = await escalateCustomerTask({
      customerTaskId,
      collectorId: user.userId,
      escalateReason,
    });

    res.json({ success: true, message: '升级成功', newTaskId: result.newTaskId });
  } catch (error) {
    console.error('客户任务升级失败:', error);
    res.status(500).json({
      error: '升级失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取客户维度待审核任务
 * GET /api/ar/customer-review
 * 权限: finance:ar:review
 */
export const getCustomerReviewList = async (req: Request, res: Response) => {
  try {
    const { reviewType, page, pageSize } = req.query;

    const result = await getCustomerReviewTasks({
      reviewType: reviewType as string,
      page: page ? parseInt(page as string, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : 10,
    });

    res.json({
      code: 200,
      data: result,
    });
  } catch (error) {
    console.error('获取客户待审核任务失败:', error);
    res.status(500).json({
      error: '获取待审核任务失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 客户任务审核
 * POST /api/ar/customer-review/:id/review
 * 权限: finance:ar:review
 */
export const reviewCustomerTask = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { id } = req.params;
    const customerTaskId = parseInt(id, 10);
    const { action, comment } = req.body;

    if (isNaN(customerTaskId) || !action) {
      res.status(400).json({ error: '参数错误', message: '参数不完整' });
      return;
    }

    if (action === 'approve') {
      await approveCustomerTaskReview({
        customerTaskId,
        reviewerId: user.userId,
        reviewerName: user.realName || user.username || '',
        reviewComment: comment,
      });
    } else if (action === 'reject') {
      if (!comment) {
        res.status(400).json({ error: '参数错误', message: '拒绝审核需要提供原因' });
        return;
      }
      await rejectCustomerTaskReview({
        customerTaskId,
        reviewerId: user.userId,
        reviewerName: user.realName || user.username || '',
        rejectComment: comment,
      });
    } else {
      res.status(400).json({ error: '参数错误', message: '无效的 action' });
      return;
    }

    res.json({ success: true, message: '审核完成' });
  } catch (error) {
    console.error('客户任务审核失败:', error);
    res.status(500).json({
      error: '审核失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取客户维度历史记录
 * GET /api/ar/customer-history
 * 权限: finance:ar:read
 */
export const getCustomerHistory = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { page, pageSize } = req.query;

    // 非管理员只能看自己的历史
    const userId = isAdminOrFinance(user.roles) ? undefined : user.userId;

    const result = await getCustomerHistoryRecords({
      userId,
      page: page ? parseInt(page as string, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : 10,
    });

    res.json({
      code: 200,
      data: result,
    });
  } catch (error) {
    console.error('获取客户历史记录失败:', error);
    res.status(500).json({
      error: '获取历史记录失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

// ==================== 逾期管理控制器 ====================

/**
 * 获取逾期统计
 * GET /api/ar/overdue/stats
 * 权限: finance:ar:overdue:read
 */
export const getOverdueStatsHandler = async (req: Request, res: Response) => {
  try {
    const stats = await getOverdueStats();
    res.json({ code: 200, message: 'success', data: stats });
  } catch (error) {
    console.error('获取逾期统计失败:', error);
    res.status(500).json({ code: 500, message: '获取逾期统计失败' });
  }
};

/**
 * 获取待预处理列表
 * GET /api/ar/overdue/preprocessing
 * 权限: finance:ar:overdue:preprocess
 */
export const getPreprocessingListHandler = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const keyword = req.query.keyword as string;
    const overdueLevel = req.query.overdueLevel as string;

    const result = await getPreprocessingList({
      page,
      pageSize,
      keyword,
      overdueLevel: overdueLevel as any,
    });

    res.json({ code: 200, message: 'success', data: result });
  } catch (error) {
    console.error('获取待预处理列表失败:', error);
    res.status(500).json({ code: 500, message: '获取待预处理列表失败' });
  }
};

/**
 * 开始预处理
 * POST /api/ar/overdue/preprocessing/start
 * 权限: finance:ar:overdue:preprocess
 */
export const startPreprocessingHandler = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { customerTaskId } = req.body;

    if (!customerTaskId) {
      res.status(400).json({ code: 400, message: 'customerTaskId 不能为空' });
      return;
    }

    const result = await startPreprocessing({
      customerTaskId: parseInt(customerTaskId, 10),
      operatorId: user.userId,
    });

    res.json({ code: 200, message: 'success', data: result });
  } catch (error) {
    console.error('开始预处理失败:', error);
    res.status(500).json({ code: 500, message: '开始预处理失败' });
  }
};

/**
 * 完成预处理
 * POST /api/ar/overdue/preprocessing/complete
 * 权限: finance:ar:overdue:preprocess
 */
export const completePreprocessingHandler = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { customerTaskId, remark } = req.body;

    if (!customerTaskId) {
      res.status(400).json({ code: 400, message: 'customerTaskId 不能为空' });
      return;
    }

    const result = await completePreprocessing({
      customerTaskId: parseInt(customerTaskId, 10),
      operatorId: user.userId,
      remark,
    });

    res.json({ code: 200, message: 'success', data: result });
  } catch (error) {
    console.error('完成预处理失败:', error);
    res.status(500).json({ code: 500, message: '完成预处理失败' });
  }
};

/**
 * 获取待分配列表
 * GET /api/ar/overdue/assignment
 * 权限: finance:ar:overdue:assign
 */
export const getAssignmentListHandler = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const keyword = req.query.keyword as string;
    const overdueLevel = req.query.overdueLevel as string;

    const result = await getAssignmentList({
      page,
      pageSize,
      keyword,
      overdueLevel: overdueLevel as any,
    });

    res.json({ code: 200, message: 'success', data: result });
  } catch (error) {
    console.error('获取待分配列表失败:', error);
    res.status(500).json({ code: 500, message: '获取待分配列表失败' });
  }
};

/**
 * 分配任务
 * POST /api/ar/overdue/assignment/assign
 * 权限: finance:ar:overdue:assign
 */
export const assignTaskHandler = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    const { customerTaskId, collectorId } = req.body;

    if (!customerTaskId || !collectorId) {
      res.status(400).json({ code: 400, message: 'customerTaskId 和 collectorId 不能为空' });
      return;
    }

    const result = await assignTask({
      customerTaskId: parseInt(customerTaskId, 10),
      collectorId: parseInt(collectorId, 10),
      assignedBy: user.userId,
    });

    res.json({ code: 200, message: 'success', data: result });
  } catch (error) {
    console.error('分配任务失败:', error);
    res.status(500).json({ code: 500, message: '分配任务失败' });
  }
};

/**
 * 获取时限配置
 * GET /api/ar/overdue/deadline-configs
 * 权限: finance:ar:overdue:read
 */
export const getDeadlineConfigsHandler = async (req: Request, res: Response) => {
  try {
    const configs = await getDeadlineConfigs();
    res.json({ code: 200, message: 'success', data: configs });
  } catch (error) {
    console.error('获取时限配置失败:', error);
    res.status(500).json({ code: 500, message: '获取时限配置失败' });
  }
};

/**
 * 更新时限配置
 * PUT /api/ar/overdue/deadline-configs/:id
 * 权限: finance:ar:overdue:config
 */
export const updateDeadlineConfigHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { deadlineHours, warningHours, isActive } = req.body;

    const configId = parseInt(id, 10);
    if (isNaN(configId)) {
      res.status(400).json({ code: 400, message: '无效的ID' });
      return;
    }

    const result = await updateDeadlineConfig(configId, {
      deadlineHours,
      warningHours,
      isActive,
    });

    res.json({ code: 200, message: 'success', data: result });
  } catch (error) {
    console.error('更新时限配置失败:', error);
    res.status(500).json({ code: 500, message: '更新时限配置失败' });
  }
};

/**
 * 获取超时预警列表
 * GET /api/ar/overdue/timeout-warnings
 * 权限: finance:ar:overdue:read
 */
export const getTimeoutWarningsHandler = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const result = await getTimeoutWarnings({ page, pageSize });
    res.json({ code: 200, message: 'success', data: result });
  } catch (error) {
    console.error('获取超时预警列表失败:', error);
    res.status(500).json({ code: 500, message: '获取超时预警列表失败' });
  }
};

/**
 * 获取时效分析
 * GET /api/ar/overdue/time-efficiency
 * 权限: finance:ar:efficiency:read
 */
export const getTimeEfficiencyHandler = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const overdueLevel = req.query.overdueLevel as string;

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];

    if (startDate) {
      queryParams.push(startDate);
      whereClause += ` AND stat_date >= $${queryParams.length}`;
    }

    if (endDate) {
      queryParams.push(endDate);
      whereClause += ` AND stat_date <= $${queryParams.length}`;
    }

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM ar_time_efficiency ${whereClause}`;
    const countResult = await appQuery(countSql, queryParams);
    const total = parseInt(countResult.rows[0].total, 10);

    // 查询汇总统计
    const statsSql = `
      SELECT 
        COALESCE(AVG(total_hours), 0) as avg_total_hours,
        COALESCE(SUM(CASE WHEN 
          preprocessing_on_time = true 
          AND assignment_on_time = true 
          AND collection_on_time = true 
          THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) * 100, 0) as on_time_rate,
        SUM(CASE WHEN 
          preprocessing_on_time = false 
          OR assignment_on_time = false 
          OR collection_on_time = false 
          THEN 1 ELSE 0 END) as timeout_count
      FROM ar_time_efficiency
      ${whereClause}
    `;
    const statsResult = await appQuery(statsSql, queryParams);
    const stats = statsResult.rows[0];

    // 查询列表（进行字段名映射）
    const listSql = `
      SELECT 
        t.id,
        t.customer_task_id as "customerTaskId",
        t.preprocessing_hours as "preprocessingHours",
        t.assignment_hours as "assignmentHours",
        t.collection_hours as "collectionHours",
        t.total_hours as "totalHours",
        t.preprocessing_on_time as "preprocessingOnTime",
        t.assignment_on_time as "assignmentOnTime",
        t.collection_on_time as "collectionOnTime",
        t.stat_date as "statDate",
        c.consumer_name as "consumerName",
        c.overdue_level as "overdueLevel"
      FROM ar_time_efficiency t
      LEFT JOIN ar_customer_collection_tasks c ON t.customer_task_id = c.id
      ${whereClause}
      ORDER BY t.stat_date DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const listResult = await appQuery(listSql, [...queryParams, pageSize, (page - 1) * pageSize]);

    res.json({
      code: 200,
      message: 'success',
      data: {
        avgTotalHours: parseFloat(stats.avg_total_hours) || 0,
        onTimeRate: parseFloat(stats.on_time_rate) || 0,
        timeoutCount: parseInt(stats.timeout_count, 10) || 0,
        list: listResult.rows,
        total,
      },
    });
  } catch (error) {
    console.error('获取时效分析失败:', error);
    res.status(500).json({ code: 500, message: '获取时效分析失败' });
  }
};

/**
 * 获取客户逾期列表
 * GET /api/ar/overdue/customers
 * 权限: finance:ar:customer:read
 */
export const getCustomerOverdueHandler = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const keyword = req.query.keyword as string;
    const overdueLevel = req.query.overdueLevel as string;

    // 构建 WHERE 条件
    let whereClause = 'WHERE ar_status = $1';
    const queryParams: any[] = ['overdue'];

    if (keyword) {
      queryParams.push(`%${keyword}%`);
      whereClause += ` AND consumer_name ILIKE $${queryParams.length}`;
    }

    // 按客户分组聚合查询（进行字段名映射）
    const sql = `
      SELECT 
        consumer_name as "consumerName",
        consumer_code as "consumerCode",
        COUNT(*) as "billCount",
        SUM(left_amount) as "totalAmount",
        MAX(COALESCE(CURRENT_DATE - due_date::date, 0)) as "maxOverdueDays",
        MAX(
          CASE 
            WHEN COALESCE(CURRENT_DATE - due_date::date, 0) <= 30 THEN 'light'
            WHEN COALESCE(CURRENT_DATE - due_date::date, 0) <= 60 THEN 'medium'
            ELSE 'severe'
          END
        ) as "maxOverdueLevel"
      FROM ar_receivables
      ${whereClause}
      GROUP BY consumer_name, consumer_code
      ORDER BY SUM(left_amount) DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const result = await appQuery(sql, [...queryParams, pageSize, (page - 1) * pageSize]);

    // 查询总数（客户数）
    const countSql = `
      SELECT COUNT(DISTINCT consumer_name) as total
      FROM ar_receivables
      ${whereClause}
    `;
    const countResult = await appQuery(countSql, queryParams);
    const total = parseInt(countResult.rows[0].total, 10);

    res.json({
      code: 200,
      message: 'success',
      data: {
        list: result.rows,
        total,
      },
    });
  } catch (error) {
    console.error('获取客户逾期列表失败:', error);
    res.status(500).json({ code: 500, message: '获取客户逾期列表失败' });
  }
};

/**
 * 获取绩效统计
 * GET /api/ar/overdue/performance
 * 权限: finance:ar:performance:read
 */
export const getPerformanceHandler = async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    // 构建日期条件
    let dateCondition = '';
    const queryParams: any[] = [];

    if (startDate) {
      queryParams.push(startDate);
      dateCondition += ` AND completed_at >= $${queryParams.length}`;
    }

    if (endDate) {
      queryParams.push(endDate);
      dateCondition += ` AND completed_at <= $${queryParams.length}`;
    }

    // 查询催收人员绩效统计
    const sql = `
      SELECT 
        t.collector_id,
        u.name as collector_name,
        COUNT(*) as task_count,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN t.status = 'completed' AND t.result_type = 'paid_off' THEN 1 ELSE 0 END) as success_count,
        AVG(
          CASE 
            WHEN t.completed_at IS NOT NULL AND t.assigned_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (t.completed_at - t.assigned_at)) / 3600 
            ELSE NULL 
          END
        ) as avg_hours,
        SUM(CASE WHEN t.status = 'timeout' THEN 1 ELSE 0 END) as timeout_count
      FROM ar_customer_collection_tasks t
      LEFT JOIN users u ON t.collector_id = u.id
      WHERE t.status IN ('completed', 'timeout') ${dateCondition}
      GROUP BY t.collector_id, u.name
      ORDER BY task_count DESC
    `;

    const result = await appQuery(sql, queryParams);

    // 计算汇总数据
    const totalTasks = result.rows.reduce((sum: number, row: any) => sum + parseInt(row.task_count), 0);
    const completedTasks = result.rows.reduce((sum: number, row: any) => sum + parseInt(row.completed_count), 0);
    const avgHours = result.rows.length > 0
      ? result.rows.reduce((sum: number, row: any) => sum + (parseFloat(row.avg_hours) || 0), 0) / result.rows.length
      : 0;

    res.json({
      code: 200,
      message: 'success',
      data: {
        totalTasks,
        completedTasks,
        avgCollectionHours: Math.round(avgHours * 100) / 100,
        successRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 10000) / 100 : 0,
        collectors: result.rows.map((row: any) => ({
          collectorId: row.collector_id,
          collectorName: row.collector_name,
          taskCount: parseInt(row.task_count),
          completedCount: parseInt(row.completed_count),
          successRate: parseInt(row.task_count) > 0
            ? Math.round((parseInt(row.success_count) / parseInt(row.task_count)) * 10000) / 100
            : 0,
          avgHours: Math.round((parseFloat(row.avg_hours) || 0) * 100) / 100,
          timeoutCount: parseInt(row.timeout_count),
        })),
      },
    });
  } catch (error) {
    console.error('获取绩效统计失败:', error);
    res.status(500).json({ code: 500, message: '获取绩效统计失败' });
  }
};

/**
 * 获取预处理任务关联的订单明细
 * GET /api/ar/overdue/preprocessing/:taskId/bills
 */
export const getPreprocessingTaskBillsHandler = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({ code: 400, message: '无效的任务ID' });
    }

    const result = await getPreprocessingTaskBills(taskId);
    res.json({ code: 200, message: 'success', data: result });
  } catch (error) {
    console.error('获取订单明细失败:', error);
    const message = error instanceof Error ? error.message : '获取订单明细失败';
    res.status(500).json({ code: 500, message });
  }
};
