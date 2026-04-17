/**
 * 商品退货规则控制器
 * @module controllers/goods-return-rules.controller
 */

import { Request, Response } from 'express';
import {
  getGoodsReturnRules,
  getGoodsReturnRuleStats,
  createGoodsReturnRule,
  updateGoodsReturnRule,
  batchSetGoodsReturnRules,
  checkGoodsReturnRule,
} from '../services/goods-return-rules';

/**
 * 获取商品退货规则列表
 * GET /api/goods-return-rules
 */
export const getGoodsReturnRulesController = async (req: Request, res: Response) => {
  try {
    const keyword = req.query.keyword as string;
    const canReturnToSupplier = req.query.canReturnToSupplier === 'true' ? true : req.query.canReturnToSupplier === 'false' ? false : undefined;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const result = await getGoodsReturnRules({
      keyword,
      canReturnToSupplier,
      page,
      pageSize,
    });
    res.json(result);
  } catch (error) {
    console.error('获取商品退货规则列表失败:', error);
    res.status(500).json({
      error: '获取商品退货规则列表失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取商品退货规则统计
 * GET /api/goods-return-rules/stats
 */
export const getGoodsReturnRuleStatsController = async (req: Request, res: Response) => {
  try {
    const result = await getGoodsReturnRuleStats();
    res.json(result);
  } catch (error) {
    console.error('获取商品退货规则统计失败:', error);
    res.status(500).json({
      error: '获取商品退货规则统计失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 创建商品退货规则
 * POST /api/goods-return-rules
 */
export const createGoodsReturnRuleController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        error: '未登录',
        message: '无法获取操作人信息',
      });
      return;
    }

    const result = await createGoodsReturnRule({
      ...req.body,
      userId,
    });
    res.json(result);
  } catch (error) {
    console.error('创建商品退货规则失败:', error);
    res.status(500).json({
      error: '创建商品退货规则失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 更新商品退货规则
 * PUT /api/goods-return-rules/:id
 */
export const updateGoodsReturnRuleController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        error: '未登录',
        message: '无法获取操作人信息',
      });
      return;
    }

    const result = await updateGoodsReturnRule(id, {
      ...req.body,
      userId,
    });
    res.json(result);
  } catch (error) {
    console.error('更新商品退货规则失败:', error);
    res.status(500).json({
      error: '更新商品退货规则失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 批量设置商品退货规则
 * POST /api/goods-return-rules/batch
 */
export const batchSetGoodsReturnRulesController = async (req: Request, res: Response) => {
  try {
    const { goodsIds, canReturnToSupplier, comment } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({
        error: '未登录',
        message: '无法获取操作人信息',
      });
      return;
    }

    const result = await batchSetGoodsReturnRules({
      goodsIds,
      canReturnToSupplier,
      comment,
      userId,
    });
    res.json(result);
  } catch (error) {
    console.error('批量设置商品退货规则失败:', error);
    res.status(500).json({
      error: '批量设置商品退货规则失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 检查商品退货规则
 * GET /api/goods-return-rules/check/:goodsId
 */
export const checkGoodsReturnRuleController = async (req: Request, res: Response) => {
  try {
    const { goodsId } = req.params;
    const result = await checkGoodsReturnRule(goodsId);
    res.json(result);
  } catch (error) {
    console.error('检查商品退货规则失败:', error);
    res.status(500).json({
      error: '检查商品退货规则失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};
