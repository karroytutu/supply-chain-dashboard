/**
 * 固定资产变更控制器
 * @module controllers/fixed-asset-mutation.controller
 */

import { Request, Response } from 'express';
import { createApplication, retryErpOperation } from '../services/fixed-asset';

/** 创建固定资产申请 */
export async function create(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const { type, formData, remark } = req.body;
    if (!type || !formData) {
      res.status(400).json({ success: false, message: '缺少必要参数: type, formData' });
      return;
    }

    const result = await createApplication(
      { type, formData, remark },
      user.id,
      user.name,
      user.department_name
    );

    res.json({ success: true, data: result, message: '申请提交成功' });
  } catch (error) {
    console.error('创建固定资产申请失败:', error);
    const message = error instanceof Error ? error.message : '创建申请失败';
    res.status(400).json({ success: false, message });
  }
}

/** 重试失败的 ERP 操作 */
export async function retry(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: '无效的申请ID' });
      return;
    }

    await retryErpOperation(id);
    res.json({ success: true, message: '重试已触发' });
  } catch (error) {
    console.error('重试 ERP 操作失败:', error);
    const message = error instanceof Error ? error.message : '重试操作失败';
    res.status(400).json({ success: false, message });
  }
}
