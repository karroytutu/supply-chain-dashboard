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
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';

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
    res.json(buildSuccessResponse(result));
  } catch (error) {
    console.error('获取商品退货规则列表失败:', error);
    res.status(500).json(buildErrorResponse(500, error instanceof Error ? error.message : '获取商品退货规则列表失败'));
  }
};

/**
 * 获取商品退货规则统计
 * GET /api/goods-return-rules/stats
 */
export const getGoodsReturnRuleStatsController = async (req: Request, res: Response) => {
  try {
    const result = await getGoodsReturnRuleStats();
    res.json(buildSuccessResponse(result));
  } catch (error) {
    console.error('获取商品退货规则统计失败:', error);
    res.status(500).json(buildErrorResponse(500, error instanceof Error ? error.message : '获取商品退货规则统计失败'));
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
      res.status(401).json(buildErrorResponse(401, '无法获取操作人信息'));
      return;
    }

    const result = await createGoodsReturnRule({
      ...req.body,
      userId,
    });
    res.json(buildSuccessResponse(result));
  } catch (error) {
    console.error('创建商品退货规则失败:', error);
    res.status(500).json(buildErrorResponse(500, error instanceof Error ? error.message : '创建商品退货规则失败'));
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
      res.status(401).json(buildErrorResponse(401, '无法获取操作人信息'));
      return;
    }

    const result = await updateGoodsReturnRule(id, {
      ...req.body,
      userId,
    });
    res.json(buildSuccessResponse(result));
  } catch (error) {
    console.error('更新商品退货规则失败:', error);
    res.status(500).json(buildErrorResponse(500, error instanceof Error ? error.message : '更新商品退货规则失败'));
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
      res.status(401).json(buildErrorResponse(401, '无法获取操作人信息'));
      return;
    }

    const result = await batchSetGoodsReturnRules({
      goodsIds,
      canReturnToSupplier,
      comment,
      userId,
    });
    res.json(buildSuccessResponse(result));
  } catch (error) {
    console.error('批量设置商品退货规则失败:', error);
    res.status(500).json(buildErrorResponse(500, error instanceof Error ? error.message : '批量设置商品退货规则失败'));
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
    res.json(buildSuccessResponse(result));
  } catch (error) {
    console.error('检查商品退货规则失败:', error);
    res.status(500).json(buildErrorResponse(500, error instanceof Error ? error.message : '检查商品退货规则失败'));
  }
};
