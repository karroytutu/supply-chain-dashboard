/**
 * OA流程交接控制器
 * @module controllers/oa-handover.controller
 */
import { createLogger } from '../utils/logger';
const log = createLogger('OaHandover');

import { Request, Response } from 'express';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';
import { scanHandoverImpact, searchUsers, getHandoverHistory } from '../services/oa/handover/handover-scanner';
import { executeHandover } from '../services/oa/handover/handover-executor';

/**
 * 扫描交接影响范围
 * GET /api/oa/workflow-handover/scan?sourceUserId=xxx
 */
export async function scanHandoverHandler(req: Request, res: Response): Promise<void> {
  try {
    const sourceUserId = parseInt(req.query.source_user_id as string);
    if (!sourceUserId || isNaN(sourceUserId)) {
      res.status(400).json(buildErrorResponse(400, '请选择被交接人'));
      return;
    }

    const result = await scanHandoverImpact(sourceUserId);
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('扫描交接影响范围失败:', error);
    res.status(500).json(buildErrorResponse(500, error instanceof Error ? error.message : '扫描失败'));
  }
}

/**
 * 执行交接
 * POST /api/oa/workflow-handover/execute
 */
export async function executeHandoverHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const userName = req.user?.name || '未知';
    if (!userId) {
      res.status(401).json(buildErrorResponse(401, '未登录'));
      return;
    }

    const { sourceUserId, targetUserId, formTypeCodes, includeInFlightInstances } = req.body;
    let { instanceIds } = req.body;
    const srcId = Number(sourceUserId);
    const tgtId = Number(targetUserId);

    if (!srcId || !tgtId || isNaN(srcId) || isNaN(tgtId)) {
      res.status(400).json(buildErrorResponse(400, '请选择被交接人和交接人'));
      return;
    }

    // 校验 instanceIds 必须为数字数组或 undefined
    if (instanceIds !== undefined && instanceIds !== null) {
      if (!Array.isArray(instanceIds)) {
        res.status(400).json(buildErrorResponse(400, 'instanceIds 必须为数组'));
        return;
      }
      instanceIds = instanceIds.map(Number).filter((n: number) => !isNaN(n) && n > 0);
    }

    const result = await executeHandover(
      { sourceUserId: srcId, targetUserId: tgtId, formTypeCodes, instanceIds, includeInFlightInstances },
      userId,
      userName
    );

    res.json(buildSuccessResponse(result, '交接完成'));
  } catch (error) {
    log.error('执行交接失败:', error);
    res.status(500).json(buildErrorResponse(500, error instanceof Error ? error.message : '交接失败'));
  }
}

/**
 * 搜索用户
 * GET /api/oa/workflow-handover/user-search?keyword=xxx
 */
export async function searchUsersHandler(req: Request, res: Response): Promise<void> {
  try {
    const keyword = (req.query.keyword as string) || '';
    const users = await searchUsers(keyword);
    res.json(buildSuccessResponse(users));
  } catch (error) {
    log.error('搜索用户失败:', error);
    res.status(500).json(buildErrorResponse(500, '搜索失败'));
  }
}

/**
 * 获取交接历史
 * GET /api/oa/workflow-handover/history
 */
export async function getHistoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 20;
    const result = await getHandoverHistory(page, pageSize);
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('获取交接历史失败:', error);
    res.status(500).json(buildErrorResponse(500, '获取历史失败'));
  }
}
