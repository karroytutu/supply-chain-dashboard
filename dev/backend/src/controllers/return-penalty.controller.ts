/**
 * 退货考核管理 Controller
 */

import { Request, Response } from 'express';
import {
  getPenalties,
  getMyPenalties,
  getPenaltyById,
  getPenaltyStats,
  updatePenaltyStatus,
} from '../services/return-penalty';

// ==================== 类型定义 ====================

interface AuthenticatedRequest extends Request {
  user: {
    userId: number;
    roles: string[];
    permissions: string[];
    dingtalkUserId: string;
    name: string;
    username?: string;
    realName?: string;
  };
}

// ==================== 辅助函数 ====================

function getCurrentUser(req: Request): AuthenticatedRequest['user'] {
  return (req as any).user;
}

// ==================== Controller ====================

/**
 * 获取考核记录列表
 * GET /api/return-penalty
 * 权限: return:penalty:read
 */
export const getPenaltyList = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      penaltyType,
      penaltyUserId,
      penaltyRole,
      status,
      startDate,
      endDate,
      keyword,
    } = req.query;

    const result = await getPenalties({
      page: parseInt(page as string) || 1,
      pageSize: parseInt(pageSize as string) || 20,
      penaltyType: penaltyType as any,
      penaltyUserId: penaltyUserId ? parseInt(penaltyUserId as string) : undefined,
      penaltyRole: penaltyRole as any,
      status: status as any,
      startDate: startDate as string,
      endDate: endDate as string,
      keyword: keyword as string,
    });

    res.json({
      code: 200,
      message: 'success',
      data: result,
    });
  } catch (error) {
    console.error('[ReturnPenaltyController] 获取考核列表失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取考核列表失败',
      data: null,
    });
  }
};

/**
 * 获取我的考核记录
 * GET /api/return-penalty/my
 * 权限: return:penalty:read
 */
export const getMyPenaltyList = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({
        code: 401,
        message: '未登录',
        data: null,
      });
    }

    const { page = 1, pageSize = 20, status } = req.query;

    const result = await getMyPenalties(user.userId, {
      page: parseInt(page as string) || 1,
      pageSize: parseInt(pageSize as string) || 20,
      status: status as string,
    });

    res.json({
      code: 200,
      message: 'success',
      data: result,
    });
  } catch (error) {
    console.error('[ReturnPenaltyController] 获取我的考核失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取我的考核失败',
      data: null,
    });
  }
};

/**
 * 获取单条考核详情
 * GET /api/return-penalty/:id
 * 权限: return:penalty:read
 */
export const getPenaltyDetail = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        code: 400,
        message: '无效的考核ID',
        data: null,
      });
    }

    const penalty = await getPenaltyById(id);
    if (!penalty) {
      return res.status(404).json({
        code: 404,
        message: '考核记录不存在',
        data: null,
      });
    }

    res.json({
      code: 200,
      message: 'success',
      data: penalty,
    });
  } catch (error) {
    console.error('[ReturnPenaltyController] 获取考核详情失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取考核详情失败',
      data: null,
    });
  }
};

/**
 * 获取考核统计
 * GET /api/return-penalty/stats
 * 权限: return:penalty:read
 */
export const getPenaltyStatistics = async (req: Request, res: Response) => {
  try {
    const stats = await getPenaltyStats();

    res.json({
      code: 200,
      message: 'success',
      data: stats,
    });
  } catch (error) {
    console.error('[ReturnPenaltyController] 获取考核统计失败:', error);
    res.status(500).json({
      code: 500,
      message: '获取考核统计失败',
      data: null,
    });
  }
};

/**
 * 确认考核
 * POST /api/return-penalty/:id/confirm
 * 权限: return:penalty:write
 */
export const confirmPenalty = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({
        code: 401,
        message: '未登录',
        data: null,
      });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        code: 400,
        message: '无效的考核ID',
        data: null,
      });
    }

    // 检查考核记录是否存在
    const penalty = await getPenaltyById(id);
    if (!penalty) {
      return res.status(404).json({
        code: 404,
        message: '考核记录不存在',
        data: null,
      });
    }

    // 检查状态
    if (penalty.status !== 'pending') {
      return res.status(400).json({
        code: 400,
        message: '该考核记录已处理，无法重复确认',
        data: null,
      });
    }

    // 更新状态
    const updated = await updatePenaltyStatus(id, 'confirmed');

    res.json({
      code: 200,
      message: '考核已确认',
      data: updated,
    });
  } catch (error) {
    console.error('[ReturnPenaltyController] 确认考核失败:', error);
    res.status(500).json({
      code: 500,
      message: '确认考核失败',
      data: null,
    });
  }
};

/**
 * 取消考核
 * POST /api/return-penalty/:id/cancel
 * 权限: return:penalty:write
 */
export const cancelPenalty = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({
        code: 401,
        message: '未登录',
        data: null,
      });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        code: 400,
        message: '无效的考核ID',
        data: null,
      });
    }

    const { reason } = req.body;

    // 检查考核记录是否存在
    const penalty = await getPenaltyById(id);
    if (!penalty) {
      return res.status(404).json({
        code: 404,
        message: '考核记录不存在',
        data: null,
      });
    }

    // 更新状态
    const updated = await updatePenaltyStatus(id, 'cancelled');

    res.json({
      code: 200,
      message: '考核已取消',
      data: updated,
    });
  } catch (error) {
    console.error('[ReturnPenaltyController] 取消考核失败:', error);
    res.status(500).json({
      code: 500,
      message: '取消考核失败',
      data: null,
    });
  }
};

/**
 * 申诉考核
 * POST /api/return-penalty/:id/appeal
 * 权限: return:penalty:read
 */
export const appealPenalty = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({
        code: 401,
        message: '未登录',
        data: null,
      });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({
        code: 400,
        message: '无效的考核ID',
        data: null,
      });
    }

    const { reason } = req.body;

    // 检查考核记录是否存在
    const penalty = await getPenaltyById(id);
    if (!penalty) {
      return res.status(404).json({
        code: 404,
        message: '考核记录不存在',
        data: null,
      });
    }

    // 检查是否是自己的考核
    if (penalty.penaltyUserId !== user.userId) {
      return res.status(403).json({
        code: 403,
        message: '无权申诉他人的考核',
        data: null,
      });
    }

    // 检查状态
    if (penalty.status !== 'pending') {
      return res.status(400).json({
        code: 400,
        message: '该考核记录已处理，无法申诉',
        data: null,
      });
    }

    // 更新状态
    const updated = await updatePenaltyStatus(id, 'appealed');

    res.json({
      code: 200,
      message: '申诉已提交',
      data: updated,
    });
  } catch (error) {
    console.error('[ReturnPenaltyController] 申诉考核失败:', error);
    res.status(500).json({
      code: 500,
      message: '申诉考核失败',
      data: null,
    });
  }
};
