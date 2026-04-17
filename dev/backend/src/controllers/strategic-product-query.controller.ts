/**
 * 战略商品管理 - 查询控制器
 * @module controllers/strategic-product-query.controller
 */

import { Request, Response } from 'express';
import {
  getStrategicProducts,
  getStrategicProductStats,
  getCategoryTree,
  getProductsForSelection,
} from '../services/strategic-product';

/** 获取战略商品列表 */
export async function getStrategicProductsController(req: Request, res: Response) {
  try {
    const { page, pageSize, status, categoryPath, keyword } = req.query;

    const result = await getStrategicProducts({
      page: page ? parseInt(page as string) : 1,
      pageSize: pageSize ? parseInt(pageSize as string) : 20,
      status: status as any,
      categoryPath: categoryPath as string,
      keyword: keyword as string,
    });

    res.json(result);
  } catch (error) {
    console.error('获取战略商品列表失败:', error);
    res.status(500).json({ success: false, message: '获取战略商品列表失败' });
  }
}

/** 获取战略商品统计数据 */
export async function getStrategicProductStatsController(req: Request, res: Response) {
  try {
    const stats = await getStrategicProductStats();
    res.json(stats);
  } catch (error) {
    console.error('获取战略商品统计失败:', error);
    res.status(500).json({ success: false, message: '获取战略商品统计失败' });
  }
}

/** 获取品类树 */
export async function getCategoryTreeController(req: Request, res: Response) {
  try {
    const tree = await getCategoryTree();
    res.json(tree);
  } catch (error) {
    console.error('获取品类树失败:', error);
    res.status(500).json({ success: false, message: '获取品类树失败' });
  }
}

/** 获取可选商品列表 */
export async function getProductsForSelectionController(req: Request, res: Response) {
  try {
    const { categoryPath, keyword, page, pageSize } = req.query;

    const result = await getProductsForSelection({
      categoryPath: categoryPath as string,
      keyword: keyword as string,
      page: page ? parseInt(page as string) : 1,
      pageSize: pageSize ? parseInt(pageSize as string) : 50,
    });

    res.json(result);
  } catch (error) {
    console.error('获取商品列表失败:', error);
    res.status(500).json({ success: false, message: '获取商品列表失败' });
  }
}
