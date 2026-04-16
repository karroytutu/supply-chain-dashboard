/**
 * 退货单控制器
 */

import { Request, Response } from 'express';
import {
  getReturnOrders,
  getReturnOrderById,
  getReturnOrderStats,
  getPendingErpOrders,
  getReturnOrderActions,
  batchConfirmReturnOrders,
  cancelReturnOrder,
  fillErpReturnNo,
  warehouseExecute,
  marketingSaleComplete,
  rollbackReturnOrder,
} from '../services/return-order';
import { syncReturnOrders } from '../services/scheduler/sync-return-orders.task';
import type { ReturnOrderStatus } from '../services/return-order';
import {
  getGoodsReturnRules,
  getGoodsReturnRuleStats,
  createGoodsReturnRule,
  updateGoodsReturnRule,
  batchSetGoodsReturnRules,
  checkGoodsReturnRule,
} from '../services/goods-return-rules';

/**
 * 获取退货单列表
 * GET /api/return-orders
 */
export const getReturnOrdersController = async (req: Request, res: Response) => {
  try {
    const keyword = req.query.keyword as string;
    const status = req.query.status as ReturnOrderStatus | undefined;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const result = await getReturnOrders({
      keyword,
      status,
      startDate,
      endDate,
      page,
      pageSize,
    });
    res.json(result);
  } catch (error) {
    console.error('获取退货单列表失败:', error);
    res.status(500).json({
      error: '获取退货单列表失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取退货单详情
 * GET /api/return-orders/:id
 */
export const getReturnOrderByIdController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const result = await getReturnOrderById(id);
    res.json(result);
  } catch (error) {
    console.error('获取退货单详情失败:', error);
    res.status(500).json({
      error: '获取退货单详情失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取退货单统计
 * GET /api/return-orders/stats
 */
export const getReturnOrderStatsController = async (req: Request, res: Response) => {
  try {
    const result = await getReturnOrderStats();
    res.json(result);
  } catch (error) {
    console.error('获取退货单统计失败:', error);
    res.status(500).json({
      error: '获取退货单统计失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取待填写ERP退货单列表
 * GET /api/return-orders/pending-erp
 */
export const getPendingErpOrdersController = async (req: Request, res: Response) => {
  try {
    const result = await getPendingErpOrders();
    res.json(result);
  } catch (error) {
    console.error('获取待填写ERP退货单列表失败:', error);
    res.status(500).json({
      error: '获取待填写ERP退货单列表失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 获取退货单操作记录
 * GET /api/return-orders/:id/actions
 */
export const getReturnOrderActionsController = async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const result = await getReturnOrderActions(orderId);
    res.json(result);
  } catch (error) {
    console.error('获取退货单操作记录失败:', error);
    res.status(500).json({
      error: '获取退货单操作记录失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 批量确认退货单
 * POST /api/return-orders/batch-confirm
 */
export const batchConfirmReturnOrdersController = async (req: Request, res: Response) => {
  try {
    const { orderIds, ruleDecision } = req.body;
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json({
        error: '未登录',
        message: '无法获取操作人信息',
      });
      return;
    }

    const result = await batchConfirmReturnOrders({
      orderIds,
      ruleDecision,
      operatorId,
      operatorName,
    });
    res.json(result);
  } catch (error) {
    console.error('批量确认退货单失败:', error);
    res.status(500).json({
      error: '批量确认退货单失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 取消退货单
 * POST /api/return-orders/:id/cancel
 */
export const cancelReturnOrderController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json({
        error: '未登录',
        message: '无法获取操作人信息',
      });
      return;
    }

    const result = await cancelReturnOrder(id, operatorId, operatorName);
    res.json(result);
  } catch (error) {
    console.error('取消退货单失败:', error);
    res.status(500).json({
      error: '取消退货单失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 填写ERP退货单号
 * POST /api/return-orders/:id/erp-fill
 */
export const fillErpReturnNoController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { erpReturnNo } = req.body;
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json({
        error: '未登录',
        message: '无法获取操作人信息',
      });
      return;
    }

    if (!erpReturnNo || typeof erpReturnNo !== 'string') {
      res.status(400).json({
        error: '参数错误',
        message: 'ERP退货单号不能为空',
      });
      return;
    }

    const result = await fillErpReturnNo({
      id,
      erpReturnNo,
      operatorId,
      operatorName,
    });
    res.json(result);
  } catch (error) {
    console.error('填写ERP退货单号失败:', error);
    res.status(500).json({
      error: '填写ERP退货单号失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 上传退货凭证图片
 * POST /api/return-orders/upload-evidence
 * 支持多文件上传，最多9张
 */
export const uploadReturnEvidenceController = async (req: Request, res: Response) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      res.status(400).json({ error: '参数错误', message: '未上传文件' });
      return;
    }

    // 返回多个文件URL
    const urls = (req.files as Express.Multer.File[]).map(
      file => `/uploads/return-evidence/${file.filename}`
    );
    res.json({ success: true, urls });
  } catch (error) {
    console.error('上传退货凭证失败:', error);
    res.status(500).json({
      error: '上传退货凭证失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 仓储执行退货
 * POST /api/return-orders/:id/warehouse
 * 改为上传凭证图片（支持多张）
 */
export const warehouseExecuteController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { evidenceUrls, comment } = req.body;
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json({
        error: '未登录',
        message: '无法获取操作人信息',
      });
      return;
    }

    if (!evidenceUrls || !Array.isArray(evidenceUrls) || evidenceUrls.length === 0) {
      res.status(400).json({
        error: '参数错误',
        message: '请先上传退货凭证图片',
      });
      return;
    }

    const result = await warehouseExecute({
      id,
      evidenceUrls,
      comment,
      operatorId,
      operatorName,
    });
    res.json(result);
  } catch (error) {
    console.error('仓储执行退货失败:', error);
    res.status(500).json({
      error: '仓储执行退货失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 营销销售完成处理
 * POST /api/return-orders/:id/marketing
 */
export const marketingSaleCompleteController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { comment } = req.body;
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json({
        error: '未登录',
        message: '无法获取操作人信息',
      });
      return;
    }

    const result = await marketingSaleComplete({
      id,
      comment,
      operatorId,
      operatorName,
    });
    res.json(result);
  } catch (error) {
    console.error('营销销售完成处理失败:', error);
    res.status(500).json({
      error: '营销销售完成处理失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 回退退货单
 * POST /api/return-orders/:id/rollback
 */
export const rollbackReturnOrderController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { comment } = req.body;
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json({
        error: '未登录',
        message: '无法获取操作人信息',
      });
      return;
    }

    const result = await rollbackReturnOrder({
      id,
      operatorId,
      operatorName,
      comment,
    });
    res.json(result);
  } catch (error) {
    console.error('回退退货单失败:', error);
    res.status(500).json({
      error: '回退退货单失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

/**
 * 手动触发同步退货数据
 * POST /api/return-orders/sync
 */
export const triggerSyncController = async (req: Request, res: Response) => {
  try {
    console.log('[TriggerSync] 手动触发退货数据同步...');
    const result = await syncReturnOrders();
    console.log('[TriggerSync] 同步完成:', result);
    res.json({
      success: true,
      message: '同步完成',
      data: result,
    });
  } catch (error) {
    console.error('[TriggerSync] 同步失败:', error);
    res.status(500).json({
      error: '同步失败',
      message: error instanceof Error ? error.message : '未知错误',
    });
  }
};

// ==================== 商品退货规则相关控制器 ====================

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
