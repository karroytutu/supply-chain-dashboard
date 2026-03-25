import { Request, Response } from 'express';
import { getDashboardData, getWarningProducts, getCategoryTreeData, getOutOfStockProductsByCategory } from '../services/dashboard.service';

/**
 * 健康检查
 */
export const healthCheck = (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
};

/**
 * 获取Dashboard数据
 */
export const getDashboard = async (req: Request, res: Response) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (error) {
    console.error('获取Dashboard数据失败:', error);
    res.status(500).json({
      error: '获取数据失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取预警商品列表
 */
export const getWarningProductsController = async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const products = await getWarningProducts(type, { page, pageSize });
    res.json(products);
  } catch (error) {
    console.error('获取预警商品列表失败:', error);
    res.status(500).json({
      error: '获取预警商品列表失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取完整的品类树数据（用于 Treemap 钻取）
 * GET /api/availability/category-tree
 */
export const getCategoryTreeController = async (req: Request, res: Response) => {
  try {
    const result = await getCategoryTreeData();
    res.json(result);
  } catch (error) {
    console.error('获取品类树数据失败:', error);
    res.status(500).json({
      error: '获取品类树数据失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
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
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    if (!categoryPath) {
      res.status(400).json({
        error: '参数错误',
        message: 'categoryPath 参数不能为空',
      });
      return;
    }

    const result = await getOutOfStockProductsByCategory(categoryPath, { page, pageSize });
    res.json(result);
  } catch (error) {
    console.error('获取品类缺货商品列表失败:', error);
    res.status(500).json({
      error: '获取品类缺货商品列表失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};
