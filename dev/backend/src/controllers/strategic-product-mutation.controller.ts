/**
 * 战略商品管理 - 操作控制器
 * @module controllers/strategic-product-mutation.controller
 */

import { Request, Response } from 'express';
import {
  addStrategicProducts,
  deleteStrategicProduct,
  confirmStrategicProduct,
  batchConfirmStrategicProducts,
  batchDeleteStrategicProducts,
  syncCategoryPath,
} from '../services/strategic-product';

/** 批量添加战略商品 */
export async function addStrategicProductsController(req: Request, res: Response) {
  try {
    const { goodsIds } = req.body;
    const userId = req.user?.userId;

    if (!goodsIds || !Array.isArray(goodsIds) || goodsIds.length === 0) {
      return res.status(400).json({ success: false, message: '请提供商品ID列表' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' });
    }

    const result = await addStrategicProducts({ goodsIds, userId });
    res.json({ success: true, message: `成功添加 ${result.addedCount} 个战略商品`, data: result });
  } catch (error) {
    console.error('添加战略商品失败:', error);
    res.status(500).json({ success: false, message: '添加战略商品失败' });
  }
}

/** 删除战略商品 */
export async function deleteStrategicProductController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const success = await deleteStrategicProduct(parseInt(id));

    if (success) {
      res.json({ success: true, message: '删除成功' });
    } else {
      res.status(404).json({ success: false, message: '战略商品不存在' });
    }
  } catch (error) {
    console.error('删除战略商品失败:', error);
    res.status(500).json({ success: false, message: '删除战略商品失败' });
  }
}

/** 确认战略商品 */
export async function confirmStrategicProductController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { action, comment } = req.body;
    const userId = req.user?.userId;
    const userRoles = req.user?.roles || [];
    const userName = req.user?.name || '';

    if (!action || !['confirm', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: '无效的操作类型' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' });
    }

    const result = await confirmStrategicProduct({
      id: parseInt(id), action, comment, userId, userRoles, userName,
    });

    if (result) {
      res.json({ success: true, message: action === 'confirm' ? '确认成功' : '已驳回', data: result });
    } else {
      res.status(404).json({ success: false, message: '战略商品不存在或无权限操作' });
    }
  } catch (error) {
    console.error('确认战略商品失败:', error);
    res.status(500).json({ success: false, message: '确认战略商品失败' });
  }
}

/** 批量确认战略商品 */
export async function batchConfirmStrategicProductsController(req: Request, res: Response) {
  try {
    const { ids, action, selectAll, status, categoryPath, keyword } = req.body;
    const userId = req.user?.userId;
    const userRoles = req.user?.roles || [];
    const userName = req.user?.name || '';

    if (!selectAll && (!ids || !Array.isArray(ids) || ids.length === 0)) {
      return res.status(400).json({ success: false, message: '请提供商品ID列表或选择全选全部' });
    }

    if (!action || !['confirm', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: '无效的操作类型' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' });
    }

    const result = await batchConfirmStrategicProducts({
      ids, action, userId, userRoles, userName, selectAll, status, categoryPath, keyword,
    });

    res.json({
      success: true,
      message: `成功${action === 'confirm' ? '确认' : '驳回'} ${result.successCount} 个战略商品`,
      data: result,
    });
  } catch (error) {
    console.error('批量确认战略商品失败:', error);
    res.status(500).json({ success: false, message: '批量确认战略商品失败' });
  }
}

/** 批量删除战略商品 */
export async function batchDeleteStrategicProductsController(req: Request, res: Response) {
  try {
    const { ids, selectAll, status, categoryPath, keyword } = req.body;

    if (!selectAll && (!ids || !Array.isArray(ids) || ids.length === 0)) {
      return res.status(400).json({ success: false, message: '请提供商品ID列表或选择全选全部' });
    }

    const result = await batchDeleteStrategicProducts({ ids, selectAll, status, categoryPath, keyword });

    res.json({ success: true, message: `成功删除 ${result.deletedCount} 个战略商品`, data: result });
  } catch (error) {
    console.error('批量删除战略商品失败:', error);
    res.status(500).json({ success: false, message: '批量删除战略商品失败' });
  }
}

/** 同步战略商品品类路径 */
export async function syncCategoryPathController(req: Request, res: Response) {
  try {
    const result = await syncCategoryPath();
    res.json({ success: true, message: `成功同步 ${result.updatedCount}/${result.totalCount} 个战略商品的品类`, data: result });
  } catch (error) {
    console.error('同步品类路径失败:', error);
    res.status(500).json({ success: false, message: '同步品类路径失败' });
  }
}
