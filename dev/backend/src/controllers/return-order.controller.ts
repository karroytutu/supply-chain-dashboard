/**
 * 退货单操作控制器
 * @module controllers/return-order.controller
 */
import { createLogger } from '../utils/logger';
const log = createLogger('ReturnOrder');

import { Request, Response } from 'express';
import {
  batchConfirmReturnOrders,
  cancelReturnOrder,
  fillErpReturnNo,
  warehouseExecute,
  marketingSaleComplete,
  rollbackReturnOrder,
} from '../services/return-order';
import { syncReturnOrders } from '../services/scheduler/sync-return-orders.task';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';

/** 批量确认退货单 */
export const batchConfirmReturnOrdersController = async (req: Request, res: Response) => {
  try {
    const { orderIds, ruleDecision } = req.body;
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json(buildErrorResponse(401, '无法获取操作人信息'));
      return;
    }

    const result = await batchConfirmReturnOrders({
      orderIds,
      ruleDecision,
      operatorId,
      operatorName,
    });
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('批量确认退货单失败:', error);
    res
      .status(500)
      .json(buildErrorResponse(500, error instanceof Error ? error.message : '批量确认退货单失败'));
  }
};

/** 取消退货单 */
export const cancelReturnOrderController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json(buildErrorResponse(401, '无法获取操作人信息'));
      return;
    }

    const result = await cancelReturnOrder(id, operatorId, operatorName);
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('取消退货单失败:', error);
    res
      .status(500)
      .json(buildErrorResponse(500, error instanceof Error ? error.message : '取消退货单失败'));
  }
};

/** 填写ERP退货单号 */
export const fillErpReturnNoController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { erpReturnNo } = req.body;
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json(buildErrorResponse(401, '无法获取操作人信息'));
      return;
    }

    if (!erpReturnNo || typeof erpReturnNo !== 'string') {
      res.status(400).json(buildErrorResponse(400, 'ERP退货单号不能为空'));
      return;
    }

    const result = await fillErpReturnNo({ id, erpReturnNo, operatorId, operatorName });
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('填写ERP退货单号失败:', error);
    res
      .status(500)
      .json(
        buildErrorResponse(500, error instanceof Error ? error.message : '填写ERP退货单号失败')
      );
  }
};

/** 上传退货凭证图片（支持多文件，最多9张） */
export const uploadReturnEvidenceController = async (req: Request, res: Response) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      res.status(400).json(buildErrorResponse(400, '未上传文件'));
      return;
    }

    const urls = (req.files as Express.Multer.File[]).map(
      file => `/uploads/return-evidence/${file.filename}`
    );
    res.json(buildSuccessResponse({ urls }));
  } catch (error) {
    log.error('上传退货凭证失败:', error);
    res
      .status(500)
      .json(buildErrorResponse(500, error instanceof Error ? error.message : '上传退货凭证失败'));
  }
};

/** 仓储执行退货 */
export const warehouseExecuteController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { evidenceUrls, comment } = req.body;
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json(buildErrorResponse(401, '无法获取操作人信息'));
      return;
    }

    if (!evidenceUrls || !Array.isArray(evidenceUrls) || evidenceUrls.length === 0) {
      res.status(400).json(buildErrorResponse(400, '请先上传退货凭证图片'));
      return;
    }

    const result = await warehouseExecute({ id, evidenceUrls, comment, operatorId, operatorName });
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('仓储执行退货失败:', error);
    res
      .status(500)
      .json(buildErrorResponse(500, error instanceof Error ? error.message : '仓储执行退货失败'));
  }
};

/** 营销销售完成处理 */
export const marketingSaleCompleteController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { comment } = req.body;
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json(buildErrorResponse(401, '无法获取操作人信息'));
      return;
    }

    const result = await marketingSaleComplete({ id, comment, operatorId, operatorName });
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('营销销售完成处理失败:', error);
    res
      .status(500)
      .json(
        buildErrorResponse(500, error instanceof Error ? error.message : '营销销售完成处理失败')
      );
  }
};

/** 回退退货单 */
export const rollbackReturnOrderController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { comment } = req.body;
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json(buildErrorResponse(401, '无法获取操作人信息'));
      return;
    }

    const result = await rollbackReturnOrder({ id, operatorId, operatorName, comment });
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('回退退货单失败:', error);
    res
      .status(500)
      .json(buildErrorResponse(500, error instanceof Error ? error.message : '回退退货单失败'));
  }
};

/** 手动触发同步退货数据 */
export const triggerSyncController = async (req: Request, res: Response) => {
  try {
    log.info('手动触发退货数据同步...');
    const result = await syncReturnOrders();
    log.info('同步完成:', result);
    res.json(buildSuccessResponse(result, '同步完成'));
  } catch (error) {
    log.error('同步失败:', error);
    res
      .status(500)
      .json(buildErrorResponse(500, error instanceof Error ? error.message : '同步失败'));
  }
};
