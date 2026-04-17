/**
 * OA审批操作控制器
 * @module controllers/oa-approval-mutation.controller
 */

import { Request, Response } from 'express';
import { getFormTypeByCodeQuery } from '../services/oa-approval/oa-form-type.query';
import {
  submitApproval,
  approveApproval,
  rejectApproval,
  transferApproval,
  countersignApproval,
  withdrawApproval,
} from '../services/oa-approval/oa-approval.mutation';

/** 提交审批 */
export async function submit(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const { formTypeCode, formData, title, urgency } = req.body;
    if (!formTypeCode || !formData || !title) {
      res.status(400).json({ success: false, message: '缺少必要参数' });
      return;
    }

    const formType = await getFormTypeByCodeQuery(formTypeCode);
    if (!formType) {
      res.status(400).json({ success: false, message: '表单类型不存在' });
      return;
    }

    const result = await submitApproval(
      { formTypeCode, formData, title, urgency },
      formType,
      user.id,
      user.name,
      user.department_name
    );

    res.json({ success: true, data: result, message: '提交成功' });
  } catch (error) {
    console.error('提交审批失败:', error);
    const message = error instanceof Error ? error.message : '提交审批失败';
    res.status(400).json({ success: false, message });
  }
}

/** 同意审批 */
export async function approve(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { comment } = req.body;
    await approveApproval(instanceId, user.id, user.name, comment);
    res.json({ success: true, message: '审批通过' });
  } catch (error) {
    console.error('同意审批失败:', error);
    const message = error instanceof Error ? error.message : '同意审批失败';
    res.status(400).json({ success: false, message });
  }
}

/** 拒绝审批 */
export async function reject(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { comment } = req.body;
    if (!comment) {
      res.status(400).json({ success: false, message: '请填写拒绝原因' });
      return;
    }

    await rejectApproval(instanceId, user.id, user.name, comment);
    res.json({ success: true, message: '已拒绝' });
  } catch (error) {
    console.error('拒绝审批失败:', error);
    const message = error instanceof Error ? error.message : '拒绝审批失败';
    res.status(400).json({ success: false, message });
  }
}

/** 转交审批 */
export async function transfer(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { transferToUserId, comment } = req.body;
    if (!transferToUserId) {
      res.status(400).json({ success: false, message: '请选择转交对象' });
      return;
    }

    await transferApproval(instanceId, user.id, user.name, transferToUserId, comment);
    res.json({ success: true, message: '转交成功' });
  } catch (error) {
    console.error('转交审批失败:', error);
    const message = error instanceof Error ? error.message : '转交审批失败';
    res.status(400).json({ success: false, message });
  }
}

/** 加签 */
export async function countersign(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const instanceId = parseInt(req.params.id);
    const { countersignType, countersignUserIds, comment } = req.body;
    if (!countersignType || !countersignUserIds || countersignUserIds.length === 0) {
      res.status(400).json({ success: false, message: '请选择加签类型和加签人' });
      return;
    }

    await countersignApproval(instanceId, user.id, user.name, countersignType, countersignUserIds, comment);
    res.json({ success: true, message: '加签成功' });
  } catch (error) {
    console.error('加签失败:', error);
    const message = error instanceof Error ? error.message : '加签失败';
    res.status(400).json({ success: false, message });
  }
}

/** 撤回审批 */
export async function withdraw(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const instanceId = parseInt(req.params.id);
    await withdrawApproval(instanceId, user.id, user.name);
    res.json({ success: true, message: '撤回成功' });
  } catch (error) {
    console.error('撤回审批失败:', error);
    const message = error instanceof Error ? error.message : '撤回审批失败';
    res.status(400).json({ success: false, message });
  }
}
