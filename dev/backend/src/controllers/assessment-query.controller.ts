/**
 * 统一考核管理 - 查询控制器
 * 提供考核记录的列表查询、统计、我的考核、分类配置、详情等接口
 */
import { createLogger } from '../utils/logger';
const log = createLogger('AssessmentQuery');

import { Request, Response } from 'express';
import {
  getAssessmentRecords,
  getAssessmentStats,
  getMyAssessments,
  getAssessmentById,
  getCategoriesConfig,
  type AssessmentQueryParams,
} from '../services/assessment';

/**
 * GET /api/assessment
 * 获取考核记录列表
 * Query: category, status, rule_type, role, keyword, start_date, end_date, page, page_size
 */
export async function getRecords(req: Request, res: Response): Promise<void> {
  try {
    const params: AssessmentQueryParams = {
      category: req.query.category as any,
      status: req.query.status as any,
      rule_type: (req.query.rule_type as string) || (req.query.ruleType as string),
      role: req.query.role as any,
      keyword: req.query.keyword as string,
      start_date: (req.query.start_date as string) || (req.query.startDate as string),
      end_date: (req.query.end_date as string) || (req.query.endDate as string),
      page: parseInt(req.query.page as string) || 1,
      page_size: parseInt((req.query.page_size as string) || (req.query.pageSize as string)) || 20,
    };

    const result = await getAssessmentRecords(params);
    res.json({ code: 200, data: result });
  } catch (error) {
    log.error('查询考核记录失败:', error);
    res.status(500).json({ code: 500, message: '查询失败' });
  }
}

/**
 * GET /api/assessment/stats
 * 获取统计数据
 * Query: category
 */
export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const category = req.query.category as any;
    const stats = await getAssessmentStats(category);
    res.json({ code: 200, data: stats });
  } catch (error) {
    log.error('查询统计数据失败:', error);
    res.status(500).json({ code: 500, message: '查询统计失败' });
  }
}

/**
 * GET /api/assessment/my
 * 获取我的考核记录
 */
export async function getMyRecords(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ code: 401, message: '未登录' });
      return;
    }

    const params: AssessmentQueryParams = {
      category: req.query.category as any,
      status: req.query.status as any,
      page: parseInt(req.query.page as string) || 1,
      page_size: parseInt((req.query.page_size as string) || (req.query.pageSize as string)) || 20,
    };

    const result = await getMyAssessments(userId, params);
    res.json({ code: 200, data: result });
  } catch (error) {
    log.error('查询我的考核记录失败:', error);
    res.status(500).json({ code: 500, message: '查询失败' });
  }
}

/**
 * GET /api/assessment/categories
 * 获取分类配置（包含各分类的规则类型列表）
 */
export async function getCategories(req: Request, res: Response): Promise<void> {
  try {
    const config = await getCategoriesConfig();
    res.json({ code: 200, data: config });
  } catch (error) {
    log.error('查询分类配置失败:', error);
    res.status(500).json({ code: 500, message: '查询失败' });
  }
}

/**
 * GET /api/assessment/:id
 * 获取单条考核记录详情
 */
export async function getDetail(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id);
    if (!id || isNaN(id)) {
      res.status(400).json({ code: 400, message: '无效的记录ID' });
      return;
    }

    const record = await getAssessmentById(id);
    if (!record) {
      res.status(404).json({ code: 404, message: '考核记录不存在' });
      return;
    }

    res.json({ code: 200, data: record });
  } catch (error) {
    log.error('查询考核记录详情失败:', error);
    res.status(500).json({ code: 500, message: '查询失败' });
  }
}
