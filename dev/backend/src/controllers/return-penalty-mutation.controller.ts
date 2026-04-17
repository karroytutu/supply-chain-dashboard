/**
 * 退货考核管理 - 操作控制器
 * @module controllers/return-penalty-mutation.controller
 */

import { Request, Response } from 'express';
import {
  getPenaltyById,
  updatePenaltyStatus,
  calculateReturnPenalties,
} from '../services/return-penalty';
import { getCurrentUser } from './return-penalty-query.controller';

/** 确认考核 */
export const confirmPenalty = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    if (!user) return res.status(401).json({ code: 401, message: '未登录', data: null });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ code: 400, message: '无效的考核ID', data: null });

    const penalty = await getPenaltyById(id);
    if (!penalty) return res.status(404).json({ code: 404, message: '考核记录不存在', data: null });
    if (penalty.status !== 'pending') return res.status(400).json({ code: 400, message: '该考核记录已处理，无法重复确认', data: null });

    const updated = await updatePenaltyStatus(id, 'confirmed');
    res.json({ code: 200, message: '考核已确认', data: updated });
  } catch (error) {
    console.error('[ReturnPenaltyController] 确认考核失败:', error);
    res.status(500).json({ code: 500, message: '确认考核失败', data: null });
  }
};

/** 取消考核 */
export const cancelPenalty = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    if (!user) return res.status(401).json({ code: 401, message: '未登录', data: null });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ code: 400, message: '无效的考核ID', data: null });

    const penalty = await getPenaltyById(id);
    if (!penalty) return res.status(404).json({ code: 404, message: '考核记录不存在', data: null });

    const updated = await updatePenaltyStatus(id, 'cancelled');
    res.json({ code: 200, message: '考核已取消', data: updated });
  } catch (error) {
    console.error('[ReturnPenaltyController] 取消考核失败:', error);
    res.status(500).json({ code: 500, message: '取消考核失败', data: null });
  }
};

/** 申诉考核 */
export const appealPenalty = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    if (!user) return res.status(401).json({ code: 401, message: '未登录', data: null });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ code: 400, message: '无效的考核ID', data: null });

    const penalty = await getPenaltyById(id);
    if (!penalty) return res.status(404).json({ code: 404, message: '考核记录不存在', data: null });
    if (penalty.penaltyUserId !== user.userId) return res.status(403).json({ code: 403, message: '无权申诉他人的考核', data: null });
    if (penalty.status !== 'pending') return res.status(400).json({ code: 400, message: '该考核记录已处理，无法申诉', data: null });

    const updated = await updatePenaltyStatus(id, 'appealed');
    res.json({ code: 200, message: '申诉已提交', data: updated });
  } catch (error) {
    console.error('[ReturnPenaltyController] 申诉考核失败:', error);
    res.status(500).json({ code: 500, message: '申诉考核失败', data: null });
  }
};

/** 手动触发考核计算 */
export const triggerPenaltyCalculation = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    if (!user) return res.status(401).json({ code: 401, message: '未登录', data: null });

    console.log(`[ReturnPenaltyController] 手动触发考核计算，操作人: ${user.name}`);
    const results = await calculateReturnPenalties();
    const totalCreated = results.reduce((sum, r) => sum + r.createdCount, 0);
    const totalProcessed = results.reduce((sum, r) => sum + r.processedCount, 0);

    res.json({
      code: 200,
      message: `考核计算完成，处理 ${totalProcessed} 条记录，创建 ${totalCreated} 条考核`,
      data: { totalProcessed, totalCreated, details: results },
    });
  } catch (error) {
    console.error('[ReturnPenaltyController] 手动触发考核计算失败:', error);
    res.status(500).json({ code: 500, message: '考核计算失败', data: null });
  }
};
