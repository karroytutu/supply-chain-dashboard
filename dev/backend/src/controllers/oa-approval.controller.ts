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

    // 前端请求拦截器自动将 camelCase 参数转为 snake_case，后端统一按 snake_case 读取
    const params: ApprovalListParams = {
      viewMode: (req.query.view_mode as ApprovalListParams['viewMode']) || 'pending',
      formTypeCode: req.query.form_type_code as string,
      status: req.query.status as ApprovalListParams['status'],
      startDate: req.query.start_date as string,
      endDate: req.query.end_date as string,
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.page_size as string) || 20,
    };

    // 参数校验：确保 viewMode 和 pageSize 为合法值
    if (!['pending', 'processed', 'my', 'cc'].includes(params.viewMode!)) {
      params.viewMode = 'pending';
    }
    if (!params.pageSize || params.pageSize < 1 || params.pageSize > 100) {
      params.pageSize = 20;
    }

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
