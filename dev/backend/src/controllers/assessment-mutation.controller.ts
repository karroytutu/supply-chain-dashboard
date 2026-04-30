/**
 * 统一考核管理 - 操作控制器
 * 提供考核记录的状态操作（确认/取消）、申诉、手动触发计算等接口
 */

import { Request, Response } from 'express';
import {
  handleAssessment,
  submitAppeal,
  triggerCalculation,
} from '../services/assessment';

/**
 * POST /api/assessment/:id/action
 * 统一状态操作
 * Body: { action: 'confirm' | 'cancel', remark?: string }
 */
export async function handleAction(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).user?.userId;
    const { action, remark } = req.body;

    if (!id || isNaN(id)) {
      res.status(400).json({ code: 400, message: '无效的记录ID' });
      return;
    }
    if (!['confirm', 'cancel'].includes(action)) {
      res.status(400).json({ code: 400, message: '无效的操作类型，只能是 confirm 或 cancel' });
      return;
    }

    const result = await handleAssessment(id, action, userId, remark);
    res.json({ code: 200, data: result, message: '操作成功' });
  } catch (error) {
    const message = (error as Error).message || '操作失败';
    console.error('[Assessment] 处理考核记录失败:', error);
    res.status(400).json({ code: 400, message });
  }
}

/**
 * POST /api/assessment/:id/appeal
 * 发起申诉（通过 OA 审批流程）
 * Body: { reason: string, documents?: string[] }
 */
export async function handleAppeal(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).user?.userId;
    const { reason, documents } = req.body;

    if (!id || isNaN(id)) {
      res.status(400).json({ code: 400, message: '无效的记录ID' });
      return;
    }
    if (!reason || !reason.trim()) {
      res.status(400).json({ code: 400, message: '申诉理由不能为空' });
      return;
    }

    const result = await submitAppeal(id, userId, reason.trim(), documents);
    res.json({ code: 200, data: result, message: '申诉提交成功' });
  } catch (error) {
    const message = (error as Error).message || '申诉提交失败';
    console.error('[Assessment] 提交申诉失败:', error);
    res.status(400).json({ code: 400, message });
  }
}

/**
 * POST /api/assessment/calculate
 * 手动触发考核计算（管理员操作）
 * Body: { category?: string, ruleType?: string }
 */
export async function handleCalculate(req: Request, res: Response): Promise<void> {
  try {
    const { category, ruleType } = req.body;
    const result = await triggerCalculation({ category, ruleType });
    res.json({ code: 200, data: result, message: '计算完成' });
  } catch (error) {
    console.error('[Assessment] 触发计算失败:', error);
    res.status(500).json({ code: 500, message: '计算失败' });
  }
}
