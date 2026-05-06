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
import { buildSuccessResponse, buildErrorResponse, buildPagedResponse } from '../utils/response';

/** 获取审批列表 */
export async function listApprovals(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
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
      pageSize: parseInt((req.query.page_size as string) || (req.query.pageSize as string)) || 20,
    };

    const result = await getApprovalList(params, userId);
    res.json(buildPagedResponse(result.list, result.total, params.page!, params.pageSize!));
  } catch (error) {
    console.error('获取审批列表失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取审批列表失败'));
  }
}

/** 获取审批统计 */
export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const stats = await getApprovalStats(userId);
    res.json(buildSuccessResponse(stats));
  } catch (error) {
    console.error('获取审批统计失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取审批统计失败'));
  }
}

/** 获取审批详情 */
export async function getDetail(req: Request, res: Response): Promise<void> {
  try {
    const instanceId = parseInt(req.params.id);
    if (isNaN(instanceId)) {
      res.status(400).json(buildErrorResponse(400, '无效的审批ID'));
      return;
    }

    const detail = await getApprovalDetail(instanceId);
    if (!detail) {
      res.status(404).json(buildErrorResponse(404, '审批实例不存在'));
      return;
    }

    res.json(buildSuccessResponse(detail));
  } catch (error) {
    console.error('获取审批详情失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取审批详情失败'));
  }
}
