/**
 * 应收看板控制器
 * 只读聚合接口，无写操作
 */
import { Request, Response } from 'express';
import { createLogger } from '../utils/logger';
const log = createLogger('ArDashboard');

import { buildSuccessResponse } from '../utils/response';
import {
  getArDashboardOverview,
  getUpcomingExpiryCustomers,
  getPipelineExpiryDetails,
} from '../services/ar-dashboard';

/**
 * GET /api/ar-dashboard/overview
 * 看板主数据（KPI + 管道 + 营销师 + 明细表）
 */
export async function handleOverview(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getArDashboardOverview();
    res.json(buildSuccessResponse(data));
  } catch (error) {
    log.error('获取应收看板数据失败:', error);
    res.status(500).json({ code: 500, message: '获取看板数据失败', data: null });
  }
}

/**
 * GET /api/ar-dashboard/upcoming-expiry
 * 即将逾期客户弹窗数据
 */
export async function handleUpcomingExpiry(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getUpcomingExpiryCustomers();
    res.json(buildSuccessResponse(data));
  } catch (error) {
    log.error('获取即将逾期数据失败:', error);
    res.status(500).json({ code: 500, message: '获取即将逾期数据失败', data: null });
  }
}

/**
 * GET /api/ar-dashboard/pipeline-expiry?status=xxx&escalationLevel=1
 * 管道节点即将逾期弹窗数据
 */

const VALID_STATUSES = ['collecting', 'extension', 'escalated', 'difference_processing'];

export async function handlePipelineExpiry(req: Request, res: Response): Promise<void> {
  try {
    const status = (req.query.status as string) || '';

    if (!status || !VALID_STATUSES.includes(status)) {
      res.status(400).json({ code: 400, message: `无效的 status 参数，可选值: ${VALID_STATUSES.join(', ')}`, data: null });
      return;
    }

    // 解析 escalationLevel，仅允许 1 或 2
    let escalationLevel: number | undefined;
    if (req.query.escalationLevel) {
      const parsed = parseInt(req.query.escalationLevel as string, 10);
      if ([1, 2].includes(parsed)) {
        escalationLevel = parsed;
      }
    }

    const data = await getPipelineExpiryDetails(status, escalationLevel);
    res.json(buildSuccessResponse(data));
  } catch (error) {
    log.error('获取管道即将逾期数据失败:', error);
    res.status(500).json({ code: 500, message: '获取管道逾期数据失败', data: null });
  }
}
