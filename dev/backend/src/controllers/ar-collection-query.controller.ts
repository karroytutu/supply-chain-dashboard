/**
 * 催收管理 - 查询控制器
 * 处理催收任务的查询、统计等 HTTP 请求
 * @module controllers/ar-collection-query.controller
 */

import { Request, Response } from 'express';
import {
  getCollectionStats,
  getCollectionTasks,
  getTaskById as getTaskByIdService,
  getTaskDetails as getTaskDetailsService,
  getTaskActions as getTaskActionsService,
  getLegalProgress as getLegalProgressService,
  getMyTasks as getMyTasksService,
  getHandlers as getHandlersService,
  getUpcomingWarnings,
  getWarningReminders,
} from '../services/ar-collection';
import { getAssessmentsByTaskId } from '../services/ar-assessment';
import { STATUS_NAMES, ROLE_NAMES } from '../services/ar-assessment/ar-assessment.types';
import type { TaskStatus, Priority, EscalationLevel } from '../services/ar-collection/ar-collection.types';
import type { WarningLevel } from '../services/ar-collection/ar-warning.query';
import {
  transformTask,
  transformDetail,
  transformAction,
  transformLegalProgress,
} from '../services/ar-collection/ar-collection.utils';

/** 获取催收统计概览 */
export const getStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.roles?.[0] || 'viewer';
    const data = await getCollectionStats(userId, role);
    res.json({ code: 200, message: 'success', data });
  } catch (error) {
    console.error('[ArCollectionController] getStats 失败:', error);
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '获取统计失败' });
  }
};

/** 获取催收任务列表 */
export const getTasks = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.roles?.[0] || 'viewer';
    const params = {
      page: parseInt(req.query.page as string) || 1,
      page_size: parseInt(req.query.page_size as string) || 20,
      keyword: req.query.keyword as string | undefined,
      status: req.query.status as TaskStatus | undefined,
      priority: req.query.priority as Priority | undefined,
      escalation_level: req.query.escalationLevel
        ? parseInt(req.query.escalationLevel as string) as EscalationLevel
        : undefined,
      handler_id: req.query.handlerId ? parseInt(req.query.handlerId as string) : undefined,
      start_date: req.query.startDate as string | undefined,
      end_date: req.query.endDate as string | undefined,
      sort_by: req.query.sort_by as string | undefined,
      sort_order: req.query.sort_order as 'asc' | 'desc' | undefined,
      userId,
      role,
      viewAll: req.query.viewAll === 'true',
    };
    const result = await getCollectionTasks(params);
    // 转换字段名
    const data = {
      ...result,
      data: result.data.map(transformTask),
    };
    res.json({ code: 200, message: 'success', data });
  } catch (error) {
    console.error('[ArCollectionController] getTasks 失败:', error);
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '获取任务列表失败' });
  }
};

/** 获取单个任务详情 */
export const getTaskById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const userId = req.user!.userId;
    const role = req.user!.roles?.[0] || 'viewer';
    const result = await getTaskByIdService(id, userId, role);
    if (!result) {
      res.status(404).json({ code: 404, message: '任务不存在' });
      return;
    }
    res.json({ code: 200, message: 'success', data: transformTask(result) });
  } catch (error) {
    console.error('[ArCollectionController] getTaskById 失败:', error);
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '获取任务详情失败' });
  }
};

/** 获取任务关联的欠款明细 */
export const getTaskDetails = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const result = await getTaskDetailsService(taskId);
    res.json({ code: 200, message: 'success', data: result.map(transformDetail) });
  } catch (error) {
    console.error('[ArCollectionController] getTaskDetails 失败:', error);
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '获取任务明细失败' });
  }
};

/** 获取操作历史（合并考核记录） */
export const getTaskActions = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    // 并发查询操作记录和考核记录
    const [actions, assessments] = await Promise.all([
      getTaskActionsService(taskId),
      getAssessmentsByTaskId(taskId),
    ]);
    // 转换操作记录
    const actionItems = actions.map(transformAction);
    // 将考核记录转换为操作记录格式
    const assessmentItems = assessments.map((record) => ({
      id: 1000000 + record.id,
      taskId: record.taskId,
      detailIds: null,
      actionType: `assessment_${record.assessmentTier}`,
      actionResult: STATUS_NAMES[record.status],
      remark: `${record.assessmentUserName}(${ROLE_NAMES[record.assessmentRole]})`,
      operatorId: 0,
      operatorName: '系统',
      operatorRole: '系统',
      createdAt: record.calculatedAt instanceof Date
        ? record.calculatedAt.toISOString()
        : record.calculatedAt,
    }));
    // 合并并按时间倒序排列
    const merged = [...actionItems, ...assessmentItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    res.json({ code: 200, message: 'success', data: merged });
  } catch (error) {
    console.error('[ArCollectionController] getTaskActions 失败:', error);
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '获取操作历史失败' });
  }
};

/** 获取法律催收进展 */
export const getLegalProgress = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const result = await getLegalProgressService(taskId);
    res.json({ code: 200, message: 'success', data: result.map(transformLegalProgress) });
  } catch (error) {
    console.error('[ArCollectionController] getLegalProgress 失败:', error);
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '获取法律进展失败' });
  }
};

/** 获取我的待办 */
export const getMyTasks = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.roles?.[0] || 'viewer';
    const data = await getMyTasksService(userId, role);
    res.json({ code: 200, message: 'success', data });
  } catch (error) {
    console.error('[ArCollectionController] getMyTasks 失败:', error);
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '获取我的待办失败' });
  }
};

/** 获取处理人列表 */
export const getHandlers = async (req: Request, res: Response) => {
  try {
    const data = await getHandlersService();
    res.json({ code: 200, message: 'success', data });
  } catch (error) {
    console.error('[ArCollectionController] getHandlers 失败:', error);
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '获取处理人列表失败' });
  }
};

/** 获取即将逾期预警数据 */
export const getWarnings = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const params = {
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
      warningLevel: req.query.warningLevel as WarningLevel | undefined,
      managerUserId: req.query.managerUserId ? parseInt(req.query.managerUserId as string) : undefined,
    };

    // 非管理员只能查看自己负责的预警
    const role = req.user!.roles?.[0] || 'viewer';
    if (role !== 'admin' && role !== 'manager' && role !== 'marketing_manager' && role !== 'marketing_supervisor') {
      params.managerUserId = userId;
    }

    const data = await getUpcomingWarnings(params);
    res.json({ code: 200, message: 'success', data });
  } catch (error) {
    console.error('[ArCollectionController] getWarnings 失败:', error);
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '获取预警数据失败' });
  }
};

/** 获取预警提醒历史记录 */
export const getReminders = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const params = {
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
      erpBillId: req.query.erpBillId as string | undefined,
      managerUserId: req.query.managerUserId ? parseInt(req.query.managerUserId as string) : undefined,
    };

    // 非管理员只能查看自己的提醒记录
    const role = req.user!.roles?.[0] || 'viewer';
    if (role !== 'admin' && role !== 'manager' && role !== 'marketing_manager' && role !== 'marketing_supervisor') {
      params.managerUserId = userId;
    }

    const data = await getWarningReminders(params);
    res.json({ code: 200, message: 'success', data });
  } catch (error) {
    console.error('[ArCollectionController] getReminders 失败:', error);
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '获取提醒历史失败' });
  }
};
