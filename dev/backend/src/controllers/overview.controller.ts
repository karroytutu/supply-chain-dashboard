/**
 * 数据总览控制器
 */

import { Request, Response } from 'express';
import { getOverviewStats, getTrendData } from '../services/overview';

/**
 * 获取全局统计数据
 * GET /api/overview/stats
 */
export const getOverviewStatsController = async (req: Request, res: Response) => {
  try {
    const data = await getOverviewStats();
    res.json(data);
  } catch (error) {
    console.error('获取全局统计数据失败:', error);
    res.status(500).json({
      error: '获取数据失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
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
    res.json(data);
  } catch (error) {
    console.error('获取趋势数据失败:', error);
    res.status(500).json({
      error: '获取趋势数据失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};
