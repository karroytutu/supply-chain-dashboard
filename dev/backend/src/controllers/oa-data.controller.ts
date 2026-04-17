/**
 * OA审批数据管理控制器
 * @module controllers/oa-data.controller
 */

import { Request, Response } from 'express';
import { getDataListAll } from '../services/oa-approval/oa-approval.query';
import { ApprovalListParams } from '../services/oa-approval/oa-approval.types';

/**
 * 获取数据列表
 * GET /api/oa-approval/data
 */
export async function getDataList(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    const params: ApprovalListParams = {
      viewMode: 'my', // 数据管理默认查看所有
      formTypeCode: req.query.formTypeCode as string,
      status: req.query.status as ApprovalListParams['status'],
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
    };

    // 数据管理查看所有审批数据（不限视图模式）
    const result = await getDataListAll(params);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('获取数据列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取数据列表失败',
    });
  }
}

/**
 * 导出数据
 * GET /api/oa-approval/data/export
 */
export async function exportData(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: '未登录',
      });
      return;
    }

    // 导出功能暂返回提示
    res.json({
      success: true,
      data: {
        message: '导出功能开发中',
      },
    });
  } catch (error) {
    console.error('导出数据失败:', error);
    res.status(500).json({
      success: false,
      message: '导出数据失败',
    });
  }
}
