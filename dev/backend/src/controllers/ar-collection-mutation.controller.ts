/**
 * 催收管理 - 操作控制器
 * 处理催收任务的核销、升级、诉讼等 HTTP 请求
 * @module controllers/ar-collection-mutation.controller
 */

import { Request, Response } from 'express';
import {
  submitVerify as submitVerifyService,
  applyExtension as applyExtensionService,
  markDifference as markDifferenceService,
  escalateTask as escalateTaskService,
  confirmVerify as confirmVerifyService,
  resolveDifference as resolveDifferenceService,
  sendCollectionNotice,
  fileLawsuit as fileLawsuitService,
  updateLegalProgress as updateLegalProgressService,
} from '../services/ar-collection';
import { getFileUrl } from '../middleware/upload';
import { handleMutationError } from '../utils/response';

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
