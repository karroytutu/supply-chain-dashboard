/**
 * 催收管理控制器
 * 处理催收任务的查询、操作等 HTTP 请求
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
  submitVerify as submitVerifyService,
  applyExtension as applyExtensionService,
  markDifference as markDifferenceService,
  escalateTask as escalateTaskService,
  confirmVerify as confirmVerifyService,
  resolveDifference as resolveDifferenceService,
  sendCollectionNotice,
  fileLawsuit as fileLawsuitService,
  updateLegalProgress as updateLegalProgressService,
  getHandlers as getHandlersService,
  getUpcomingWarnings,
  getWarningReminders,
} from '../services/ar-collection';
import type { TaskStatus, Priority } from '../services/ar-collection/ar-collection.types';
import type { WarningLevel } from '../services/ar-collection/ar-warning.query';
import { getFileUrl } from '../middleware/upload';
import {
  transformTask,
  transformDetail,
  transformAction,
  transformLegalProgress,
} from '../services/ar-collection/ar-collection.utils';

/** 统一处理 POST 操作错误，根据错误信息返回合适的状态码 */
function handleMutationError(res: Response, error: unknown, fallbackMsg: string): void {
  const msg = error instanceof Error ? error.message : fallbackMsg;
  if (msg.includes('不存在')) {
    res.status(404).json({ code: 404, message: msg });
  } else if (msg.includes('不允许') || msg.includes('无权') || msg.includes('已') || msg.includes('不能')) {
    res.status(400).json({ code: 400, message: msg });
  } else {
    console.error('ar-collection error:', error);
    res.status(500).json({ code: 500, message: msg });
  }
}

// ============================================
// 查询类
// ============================================

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
      handler_id: req.query.handlerId ? parseInt(req.query.handlerId as string) : undefined,
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
    const result = await getTaskByIdService(id);
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

/** 获取操作历史 */
export const getTaskActions = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const result = await getTaskActionsService(taskId);
    res.json({ code: 200, message: 'success', data: result.map(transformAction) });
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

// ============================================
// 操作类
// ============================================

/** 核销回款申请 */
export const submitVerify = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const { userId: operatorId, name: operatorName, roles } = req.user!;
    const operatorRole = roles?.[0] || 'viewer';
    await submitVerifyService(taskId, req.body, operatorId, operatorName, operatorRole);
    res.json({ code: 200, message: 'success', data: null });
  } catch (error) {
    handleMutationError(res, error, '核销操作失败');
  }
};

/** 申请延期 */
export const applyExtension = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const { userId: operatorId, name: operatorName, roles } = req.user!;
    const operatorRole = roles?.[0] || 'viewer';
    await applyExtensionService(taskId, req.body, operatorId, operatorName, operatorRole);
    res.json({ code: 200, message: 'success', data: null });
  } catch (error) {
    handleMutationError(res, error, '延期申请失败');
  }
};

/** 标记差异 */
export const markDifference = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const { userId: operatorId, name: operatorName, roles } = req.user!;
    const operatorRole = roles?.[0] || 'viewer';
    await markDifferenceService(taskId, req.body, operatorId, operatorName, operatorRole);
    res.json({ code: 200, message: 'success', data: null });
  } catch (error) {
    handleMutationError(res, error, '标记差异失败');
  }
};

/** 升级处理 */
export const escalateTask = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const { userId: operatorId, name: operatorName, roles } = req.user!;
    const operatorRole = roles?.[0] || 'viewer';
    await escalateTaskService(taskId, req.body, operatorId, operatorName, operatorRole);
    res.json({ code: 200, message: 'success', data: null });
  } catch (error) {
    handleMutationError(res, error, '升级处理失败');
  }
};

/** 出纳确认核销 */
export const confirmVerify = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const { userId: operatorId, name: operatorName, roles } = req.user!;
    const operatorRole = roles?.[0] || 'viewer';
    await confirmVerifyService(taskId, req.body, operatorId, operatorName, operatorRole);
    res.json({ code: 200, message: 'success', data: null });
  } catch (error) {
    handleMutationError(res, error, '确认核销失败');
  }
};

/** 差异解决 */
export const resolveDifference = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const { userId: operatorId, name: operatorName, roles } = req.user!;
    const operatorRole = roles?.[0] || 'viewer';
    await resolveDifferenceService(taskId, req.body, operatorId, operatorName, operatorRole);
    res.json({ code: 200, message: 'success', data: null });
  } catch (error) {
    handleMutationError(res, error, '差异解决失败');
  }
};

/** 发送催收函 */
export const sendNotice = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const { userId: operatorId, name: operatorName, roles } = req.user!;
    const operatorRole = roles?.[0] || 'viewer';
    await sendCollectionNotice(taskId, req.body, operatorId, operatorName, operatorRole);
    res.json({ code: 200, message: 'success', data: null });
  } catch (error) {
    handleMutationError(res, error, '发送催收函失败');
  }
};

/** 提起诉讼 */
export const fileLawsuit = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const { userId: operatorId, name: operatorName, roles } = req.user!;
    const operatorRole = roles?.[0] || 'viewer';
    await fileLawsuitService(taskId, req.body, operatorId, operatorName, operatorRole);
    res.json({ code: 200, message: 'success', data: null });
  } catch (error) {
    handleMutationError(res, error, '提起诉讼失败');
  }
};

/** 更新法律进展 */
export const updateLegalProgress = async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) {
      res.status(400).json({ code: 400, message: '无效的任务ID' });
      return;
    }
    const { userId: operatorId, name: operatorName, roles } = req.user!;
    const operatorRole = roles?.[0] || 'viewer';
    await updateLegalProgressService(taskId, req.body, operatorId, operatorName, operatorRole);
    res.json({ code: 200, message: 'success', data: null });
  } catch (error) {
    handleMutationError(res, error, '更新法律进展失败');
  }
};

/** 上传凭证文件 */
export const uploadEvidence = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ code: 400, message: '请上传文件' });
      return;
    }
    const fileUrl = getFileUrl(req.file.filename);
    res.json({
      code: 200,
      message: 'success',
      data: {
        filename: req.file.filename,
        url: fileUrl,
        originalName: req.file.originalname,
        size: req.file.size,
      },
    });
  } catch (error) {
    console.error('[ArCollectionController] uploadEvidence 失败:', error);
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '上传失败' });
  }
};

// ============================================
// 预警查询类
// ============================================

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
    if (role !== 'admin' && role !== 'manager') {
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
    if (role !== 'admin' && role !== 'manager') {
      params.managerUserId = userId;
    }

    const data = await getWarningReminders(params);
    res.json({ code: 200, message: 'success', data });
  } catch (error) {
    console.error('[ArCollectionController] getReminders 失败:', error);
    res.status(500).json({ code: 500, message: error instanceof Error ? error.message : '获取提醒历史失败' });
  }
};
