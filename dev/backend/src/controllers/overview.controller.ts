/**
 * 数据总览控制器
 */
import { createLogger } from '../utils/logger';
const log = createLogger('Overview');
import { Request, Response } from 'express';
import { getOverviewStats, getOverviewFull, getTrendData } from '../services/overview';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';

/**
 * 获取全局统计数据
 * GET /api/overview/stats
 */
export const getOverviewStatsController = async (req: Request, res: Response) => {
  try {
    const data = await getOverviewStats();
    res.json(buildSuccessResponse(data));
  } catch (error) {
    log.error('获取全局统计数据失败:', error);
    res
      .status(500)
      .json(buildErrorResponse(500, error instanceof Error ? error.message : '获取数据失败'));
  }
};

/**
 * 获取完整概览数据（stats + trend）
 * GET /api/overview/full
 */
export const getOverviewFullController = async (req: Request, res: Response) => {
  try {
    const data = await getOverviewFull();
    res.json(buildSuccessResponse(data));
  } catch (error) {
    log.error('获取完整概览数据失败:', error);
    res
      .status(500)
      .json(buildErrorResponse(500, error instanceof Error ? error.message : '获取概览数据失败'));
  }
};

/**
 * 获取趋势数据
 * GET /api/overview/trend?days=7
 */
export const getTrendDataController = async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const data = await getTrendData(days);
    res.json(buildSuccessResponse(data));
  } catch (error) {
    log.error('获取趋势数据失败:', error);
    res
      .status(500)
      .json(buildErrorResponse(500, error instanceof Error ? error.message : '获取趋势数据失败'));
  }
};
