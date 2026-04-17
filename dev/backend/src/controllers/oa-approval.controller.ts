/**
 * OA审批查询控制器
 * 处理审批实例的查询逻辑
 * @module controllers/oa-approval.controller
 */

import { Request, Response } from 'express';
import {
  getApprovalList,
  getApprovalStats,
  getApprovalDetail,
} from '../services/oa-approval/oa-approval.query';
import { ApprovalListParams } from '../services/oa-approval/oa-approval.types';

/** 获取审批列表 */
export async function listApprovals(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const params: ApprovalListParams = {
      viewMode: (req.query.viewMode as ApprovalListParams['viewMode']) || 'pending',
      formTypeCode: req.query.formTypeCode as string,
      status: req.query.status as ApprovalListParams['status'],
      urgency: req.query.urgency as ApprovalListParams['urgency'],
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
    };

    const result = await getApprovalList(params, userId);
    res.json({
      success: true,
      data: result.list,
      total: result.total,
      page: params.page,
      pageSize: params.pageSize,
    });
  } catch (error) {
    console.error('获取审批列表失败:', error);
    res.status(500).json({ success: false, message: '获取审批列表失败' });
  }
}

/** 获取审批统计 */
export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }

    const stats = await getApprovalStats(userId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('获取审批统计失败:', error);
    res.status(500).json({ success: false, message: '获取审批统计失败' });
  }
}

/** 获取审批详情 */
export async function getDetail(req: Request, res: Response): Promise<void> {
  try {
    const instanceId = parseInt(req.params.id);
    if (isNaN(instanceId)) {
      res.status(400).json({ success: false, message: '无效的审批ID' });
      return;
    }

    const detail = await getApprovalDetail(instanceId);
    if (!detail) {
      res.status(404).json({ success: false, message: '审批实例不存在' });
      return;
    }

    res.json({ success: true, data: detail });
  } catch (error) {
    console.error('获取审批详情失败:', error);
    res.status(500).json({ success: false, message: '获取审批详情失败' });
  }
}
