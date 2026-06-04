/**
 * 退货单查询控制器
 * @module controllers/return-order-query.controller
 */
import { createLogger } from '../utils/logger';
const log = createLogger('ReturnOrderQuery');

import { Request, Response } from 'express';
import {
  getReturnOrders,
  getReturnOrderById,
  getReturnOrderStats,
  getPendingErpOrders,
  getReturnOrderActions,
  type ReturnOrderStatus,
} from '../services/return-order';
import { buildSuccessResponse, buildErrorResponse } from '../utils/response';

/** 获取退货单列表 */
export const getReturnOrdersController = async (req: Request, res: Response) => {
  try {
    const keyword = req.query.keyword as string;
    const status = req.query.status as ReturnOrderStatus | undefined;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize =
      parseInt((req.query.page_size as string) || (req.query.pageSize as string)) || 20;

    const result = await getReturnOrders({ keyword, status, startDate, endDate, page, pageSize });
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('获取退货单列表失败:', error);
    res
      .status(500)
      .json(buildErrorResponse(500, error instanceof Error ? error.message : '获取退货单列表失败'));
  }
};

/** 获取退货单详情 */
export const getReturnOrderByIdController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const result = await getReturnOrderById(id);
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('获取退货单详情失败:', error);
    res
      .status(500)
      .json(buildErrorResponse(500, error instanceof Error ? error.message : '获取退货单详情失败'));
  }
};

/** 获取退货单统计 */
export const getReturnOrderStatsController = async (req: Request, res: Response) => {
  try {
    const result = await getReturnOrderStats();
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('获取退货单统计失败:', error);
    res
      .status(500)
      .json(buildErrorResponse(500, error instanceof Error ? error.message : '获取退货单统计失败'));
  }
};

/** 获取待填写ERP退货单列表 */
export const getPendingErpOrdersController = async (req: Request, res: Response) => {
  try {
    const result = await getPendingErpOrders();
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('获取待填写ERP退货单列表失败:', error);
    res
      .status(500)
      .json(
        buildErrorResponse(
          500,
          error instanceof Error ? error.message : '获取待填写ERP退货单列表失败'
        )
      );
  }
};

/** 获取退货单操作记录 */
export const getReturnOrderActionsController = async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const result = await getReturnOrderActions(orderId);
    res.json(buildSuccessResponse(result));
  } catch (error) {
    log.error('获取退货单操作记录失败:', error);
    res
      .status(500)
      .json(
        buildErrorResponse(500, error instanceof Error ? error.message : '获取退货单操作记录失败')
      );
  }
};
