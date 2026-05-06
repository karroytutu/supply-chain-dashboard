import { Request, Response } from 'express';
import { getDashboardData, getWarningProducts, getCategoryTreeData, getOutOfStockProductsByCategory } from '../services/dashboard.service';
import type { StrategicLevel } from '../services/warning/warning.types';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';

/**
 * 健康检查
 */
export const healthCheck = (req: Request, res: Response) => {
  res.json(buildSuccessResponse({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));
};

/**
 * 获取Dashboard数据
 */
export const getDashboard = async (req: Request, res: Response) => {
  try {
    const data = await getDashboardData();
    res.json(buildSuccessResponse(data));
  } catch (error) {
    console.error('获取Dashboard数据失败:', error);
    res.status(500).json(buildErrorResponse(500, error instanceof Error ? error.message : '获取数据失败'));
  }
};

/**
 * 获取预警商品列表
 */
export const getWarningProductsController = async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt((req.query.page_size as string) || (req.query.pageSize as string)) || 20;
    const strategicLevel = req.query.strategicLevel as StrategicLevel | undefined;

    // 验证 strategicLevel 参数
    if (strategicLevel && strategicLevel !== 'strategic' && strategicLevel !== 'normal') {
      res.status(400).json(buildErrorResponse(400, 'strategicLevel 必须是 strategic 或 normal'));
      return;
    }

    const products = await getWarningProducts(type, { page, pageSize, strategicLevel });
    res.json(buildSuccessResponse(products));
  } catch (error) {
    console.error('获取预警商品列表失败:', error);
    res.status(500).json(buildErrorResponse(500, error instanceof Error ? error.message : '获取预警商品列表失败'));
  }
};

/**
 * 获取完整的品类树数据（用于 Treemap 钻取）
 * GET /api/availability/category-tree
 */
export const getCategoryTreeController = async (req: Request, res: Response) => {
  try {
    const result = await getCategoryTreeData();
    res.json(buildSuccessResponse(result));
  } catch (error) {
    console.error('获取品类树数据失败:', error);
    res.status(500).json(buildErrorResponse(500, error instanceof Error ? error.message : '获取品类树数据失败'));
  }
};

/**
 * 获取品类缺货商品列表
 * GET /api/availability/out-of-stock?categoryPath=xxx&page=1&pageSize=20
 */
export const getCategoryOutOfStockController = async (req: Request, res: Response) => {
  try {
    const categoryPath = req.query.categoryPath as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt((req.query.page_size as string) || (req.query.pageSize as string)) || 20;

    if (!categoryPath) {
      res.status(400).json(buildErrorResponse(400, 'categoryPath 参数不能为空'));
      return;
    }

    const result = await getOutOfStockProductsByCategory(categoryPath, { page, pageSize });
    res.json(buildSuccessResponse(result));
  } catch (error) {
    console.error('获取品类缺货商品列表失败:', error);
    res.status(500).json(buildErrorResponse(500, error instanceof Error ? error.message : '获取品类缺货商品列表失败'));
  }
};
