/**
 * 催收考核管理 - 查询控制器
 */

import { Request, Response } from 'express';
import {
  getAssessments,
  getMyAssessments,
  getAssessmentById,
  getAssessmentStats,
} from '../services/ar-assessment';

/** 认证请求类型 */
interface AuthenticatedRequest extends Request {
  user: {
    userId: number;
    roles: string[];
    permissions: string[];
    dingtalkUserId: string;
    name: string;
  };
}

function getCurrentUser(req: Request): AuthenticatedRequest['user'] {
  return (req as any).user;
}

/**
 * 获取考核记录列表
 * GET /api/ar-assessment
 */
export const getAssessmentList = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      assessmentTier,
      assessmentUserId,
      assessmentRole,
      status,
      startDate,
      endDate,
      keyword,
    } = req.query;

    const result = await getAssessments({
      page: parseInt(page as string) || 1,
      pageSize: parseInt(pageSize as string) || 20,
      assessmentTier: assessmentTier as any,
      assessmentUserId: assessmentUserId ? parseInt(assessmentUserId as string) : undefined,
      assessmentRole: assessmentRole as any,
      status: status as any,
      startDate: startDate as string,
      endDate: endDate as string,
      keyword: keyword as string,
    });

    res.json({ code: 200, message: 'success', data: result });
  } catch (error) {
    console.error('[ArAssessmentController] 获取考核列表失败:', error);
    res.status(500).json({ code: 500, message: '获取考核列表失败', data: null });
  }
};

/**
 * 获取我的考核记录
 * GET /api/ar-assessment/my
 */
export const getMyAssessmentList = async (req: Request, res: Response) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ code: 401, message: '未登录', data: null });
    }

    const { page = 1, pageSize = 20, status } = req.query;

    const result = await getMyAssessments(user.userId, {
      page: parseInt(page as string) || 1,
      pageSize: parseInt(pageSize as string) || 20,
      status: status as string,
    });

    res.json({ code: 200, message: 'success', data: result });
  } catch (error) {
    console.error('[ArAssessmentController] 获取我的考核失败:', error);
    res.status(500).json({ code: 500, message: '获取我的考核失败', data: null });
  }
};

/**
 * 获取单条考核详情
 * GET /api/ar-assessment/:id
 */
export const getAssessmentDetail = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ code: 400, message: '无效的考核ID', data: null });
    }

    const assessment = await getAssessmentById(id);
    if (!assessment) {
      return res.status(404).json({ code: 404, message: '考核记录不存在', data: null });
    }

    res.json({ code: 200, message: 'success', data: assessment });
  } catch (error) {
    console.error('[ArAssessmentController] 获取考核详情失败:', error);
    res.status(500).json({ code: 500, message: '获取考核详情失败', data: null });
  }
};

/**
 * 获取考核统计
 * GET /api/ar-assessment/stats
 */
export const getAssessmentStatistics = async (req: Request, res: Response) => {
  try {
    const stats = await getAssessmentStats();
    res.json({ code: 200, message: 'success', data: stats });
  } catch (error) {
    console.error('[ArAssessmentController] 获取考核统计失败:', error);
    res.status(500).json({ code: 500, message: '获取考核统计失败', data: null });
  }
};

export { getCurrentUser, AuthenticatedRequest };
