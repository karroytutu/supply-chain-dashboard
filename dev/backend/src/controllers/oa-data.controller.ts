/**
 * OA数据管理控制器
 * @module controllers/oa-data.controller
 */

import { Request, Response } from 'express';
import { getDataListAll } from '../services/oa/oa.query';
import { ApprovalListParams } from '../services/oa/oa.types';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';

/**
 * 获取数据列表
 * GET /api/oa/data
 */
export async function getDataList(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    // 前端请求拦截器自动将 camelCase 参数转为 snake_case，后端统一按 snake_case 读取
    const params: ApprovalListParams = {
      viewMode: 'my', // 数据管理默认查看所有
      formTypeCode: req.query.form_type_code as string,
      status: req.query.status as ApprovalListParams['status'],
      startDate: req.query.start_date as string,
      endDate: req.query.end_date as string,
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.page_size as string) || 20,
    };

    // 参数校验：确保 pageSize 为合法值
    if (!params.pageSize || params.pageSize < 1 || params.pageSize > 100) {
      params.pageSize = 20;
    }

    // 数据管理查看所有审批数据（不限视图模式）
    const result = await getDataListAll(params);

    res.json(buildSuccessResponse(result));
  } catch (error) {
    console.error('获取数据列表失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取数据列表失败'));
  }
}

/**
 * 导出数据
 * GET /api/oa/data/export
 */
export async function exportData(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    // 导出功能暂返回提示
    res.json(buildSuccessResponse({ message: '导出功能开发中' }));
  } catch (error) {
    console.error('导出数据失败:', error);
    res.status(500).json(buildErrorResponse(500, '导出数据失败'));
  }
}
