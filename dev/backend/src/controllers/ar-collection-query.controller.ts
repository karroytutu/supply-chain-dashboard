/**
 * 催收管理 - 查询控制器
 * 处理催收任务的查询、统计等 HTTP 请求
 * @module controllers/ar-collection-query.controller
 */
import { createLogger } from '../utils/logger';
const log = createLogger('ArCollectionQuery');

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
import { assessmentRepository } from '../services/assessment';
import type { CollectionActionDTO } from '../services/ar-collection/ar-collection.dto';
import type {
  TaskStatus,
  Priority,
  EscalationLevel,
} from '../services/ar-collection/ar-collection.types';
import type { WarningLevel } from '../services/ar-collection/ar-warning.query';
import {
  toTaskDTO,
  toDetailDTO,
  toActionDTO,
  toLegalProgressDTO,
  assessmentToActionDTO,
} from '../services/ar-collection/ar-collection.mapper';
import { MANAGER_ROLES } from '../utils/constants';

/** 获取催收统计概览 */
export const getStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.roles?.[0] || 'viewer';
    const data = await getCollectionStats(userId, role);
    res.json({ code: 200, message: 'success', data });
  } catch (error) {
    log.error('getStats 失败:', error);
    res
      .status(500)
      .json({ code: 500, message: error instanceof Error ? error.message : '获取统计失败' });
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
      escalation_level: req.query.escalation_level
        ? (parseInt(req.query.escalation_level as string) as EscalationLevel)
        : undefined,
      handler_id: req.query.handler_id ? parseInt(req.query.handler_id as string) : undefined,
      start_date: req.query.start_date as string | undefined,
      end_date: req.query.end_date as string | undefined,
      sort_by: req.query.sort_by as string | undefined,
      sort_order: req.query.sort_order as 'asc' | 'desc' | undefined,
      userId,
      role,
      viewAll: req.query.view_all === 'true',
    };
    const result = await getCollectionTasks(params);
    // 转换字段名
    const data = {
      ...result,
      data: result.data.map(toTaskDTO),
    };
    res.json({ code: 200, message: 'success', data });
  } catch (error) {
    log.error('getTasks 失败:', error);
    res
      .status(500)
      .json({ code: 500, message: error instanceof Error ? error.message : '获取任务列表失败' });
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
    res.json({ code: 200, message: 'success', data: toTaskDTO(result) });
  } catch (error) {
    log.error('getTaskById 失败:', error);
    res
      .status(500)
      .json({ code: 500, message: error instanceof Error ? error.message : '获取任务详情失败' });
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
    res.json({ code: 200, message: 'success', data: result.map(toDetailDTO) });
  } catch (error) {
    log.error('getTaskDetails 失败:', error);
    res
      .status(500)
      .json({ code: 500, message: error instanceof Error ? error.message : '获取任务明细失败' });
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
      assessmentRepository.getRecordsBySourceId(taskId),
    ]);
    // 转换操作记录，过滤 null（toActionDTO 可能返回 null）
    const actionItems = actions
      .map(toActionDTO)
      .filter((x): x is CollectionActionDTO => x !== null);
    // 将考核记录转换为操作记录格式
    const assessmentItems = assessments.map(assessmentToActionDTO);
    // 合并并按时间倒序排列
    const merged = [...actionItems, ...assessmentItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    res.json({ code: 200, message: 'success', data: merged });
  } catch (error) {
    log.error('getTaskActions 失败:', error);
    res
      .status(500)
      .json({ code: 500, message: error instanceof Error ? error.message : '获取操作历史失败' });
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
    res.json({ code: 200, message: 'success', data: result.map(toLegalProgressDTO) });
  } catch (error) {
    log.error('getLegalProgress 失败:', error);
    res
      .status(500)
      .json({ code: 500, message: error instanceof Error ? error.message : '获取法律进展失败' });
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
    log.error('getMyTasks 失败:', error);
    res
      .status(500)
      .json({ code: 500, message: error instanceof Error ? error.message : '获取我的待办失败' });
  }
};

/** 获取处理人列表 */
export const getHandlers = async (req: Request, res: Response) => {
  try {
    const data = await getHandlersService();
    res.json({ code: 200, message: 'success', data });
  } catch (error) {
    log.error('getHandlers 失败:', error);
    res
      .status(500)
      .json({ code: 500, message: error instanceof Error ? error.message : '获取处理人列表失败' });
  }
};

/** 获取即将逾期预警数据 */
export const getWarnings = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const params = {
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt((req.query.page_size as string) || (req.query.pageSize as string)) || 20,
      warningLevel: req.query.warningLevel as WarningLevel | undefined,
      managerUserId: req.query.managerUserId
        ? parseInt(req.query.managerUserId as string)
        : undefined,
    };

    // 非管理员只能查看自己负责的预警
    const role = req.user!.roles?.[0] || 'viewer';
    if (!MANAGER_ROLES.includes(role as any)) {
      params.managerUserId = userId;
    }

    const data = await getUpcomingWarnings(params);
    res.json({ code: 200, message: 'success', data });
  } catch (error) {
    log.error('getWarnings 失败:', error);
    res
      .status(500)
      .json({ code: 500, message: error instanceof Error ? error.message : '获取预警数据失败' });
  }
};

/** 获取预警提醒历史记录 */
export const getReminders = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const params = {
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt((req.query.page_size as string) || (req.query.pageSize as string)) || 20,
      erpBillId: req.query.erpBillId as string | undefined,
      managerUserId: req.query.managerUserId
        ? parseInt(req.query.managerUserId as string)
        : undefined,
    };

    // 非管理员只能查看自己的提醒记录
    const role = req.user!.roles?.[0] || 'viewer';
    if (!MANAGER_ROLES.includes(role as any)) {
      params.managerUserId = userId;
    }

    const data = await getWarningReminders(params);
    res.json({ code: 200, message: 'success', data });
  } catch (error) {
    log.error('getReminders 失败:', error);
    res
      .status(500)
      .json({ code: 500, message: error instanceof Error ? error.message : '获取提醒历史失败' });
  }
};
