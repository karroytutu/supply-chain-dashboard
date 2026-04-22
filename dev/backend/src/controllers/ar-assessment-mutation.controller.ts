/**
 * 催收考核管理 - 处理状态标记控制器
 */

import { Request, Response } from 'express';
import {
  getAssessmentById,
  updateAssessmentHandleStatus,
  calculateArAssessments,
} from '../services/ar-assessment';
import { getCurrentUser } from './ar-assessment-query.controller';

/** 标记考核处理状态 */
export const handleAssessment = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ code: 401, message: '未登录', data: null });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, message: '无效的考核ID', data: null });
    }

    const { status, remark } = req.body;

    // 校验状态值
    if (!['handled', 'skipped'].includes(status)) {
      return res.status(400).json({
        code: 400,
        message: '无效的处理状态，只能是 handled 或 skipped',
        data: null,
      });
    }

    // 标记为"无需处理"时必须填写备注
    if (status === 'skipped' && (!remark || remark.trim().length === 0)) {
      return res.status(400).json({
        code: 400,
        message: '标记为"无需处理"时必须填写备注',
        data: null,
      });
    }

    // 校验记录是否存在且未处理
    const assessment = await getAssessmentById(id);
    if (!assessment) {
      return res.status(404).json({ code: 404, message: '考核记录不存在', data: null });
    }
    if (assessment.status !== 'pending') {
      return res.status(400).json({
        code: 400,
        message: '该记录已处理，无法重复标记',
        data: null,
      });
    }

    const updated = await updateAssessmentHandleStatus(
      id,
      status,
      status === 'skipped' ? remark.trim() : null,
      user.userId
    );

    if (!updated) {
      return res.status(409).json({
        code: 409,
        message: '该记录已被他人处理，请刷新后重试',
        data: null,
      });
    }

    const messageMap: Record<string, string> = {
      handled: '已标记为已处理',
      skipped: '已标记为无需处理',
    };

    res.json({ code: 200, message: messageMap[status], data: updated });
  } catch (error) {
    console.error('[ArAssessmentController] 标记处理状态失败:', error);
    res.status(500).json({ code: 500, message: '标记处理状态失败', data: null });
  }
};

/** 手动触发考核计算 */
export const triggerAssessmentCalculation = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ code: 401, message: '未登录', data: null });
    }

    console.log(`[ArAssessmentController] 手动触发考核计算，操作人: ${user.name}`);
    const results = await calculateArAssessments();
    const totalCreated = results.reduce((sum, r) => sum + r.createdCount, 0);
    const totalProcessed = results.reduce((sum, r) => sum + r.processedCount, 0);

    res.json({
      code: 200,
      message: `考核计算完成，处理 ${totalProcessed} 个任务，创建 ${totalCreated} 条考核`,
      data: { totalProcessed, totalCreated, details: results },
    });
  } catch (error) {
    console.error('[ArAssessmentController] 手动触发考核计算失败:', error);
    res.status(500).json({ code: 500, message: '考核计算失败', data: null });
  }
};
