/**
 * 工作台控制器
 * 提供首页工作台聚合数据接口
 */

import { Request, Response } from 'express';
import { getWorkspaceData } from '../services/workspace/workspace.service';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';

/**
 * 获取工作台数据
 * GET /api/workspace
 */
export const getWorkspaceDataController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const permissions = req.user?.permissions || [];
    const roles = req.user?.roles || [];

    if (!userId) {
      res.status(401).json(buildErrorResponse(401, '未认证'));
      return;
    }

    const data = await getWorkspaceData(userId, permissions, roles);
    res.json(buildSuccessResponse(data));
  } catch (error) {
    console.error('获取工作台数据失败:', error);
    res.status(500).json(
      buildErrorResponse(500, error instanceof Error ? error.message : '获取工作台数据失败')
    );
  }
};
