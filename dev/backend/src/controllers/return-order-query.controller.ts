/**
 * 退货单查询控制器
 * @module controllers/return-order-query.controller
 */

import { Request, Response } from 'express';
import {
  getReturnOrders,
  getReturnOrderById,
  getReturnOrderStats,
  getPendingErpOrders,
  getReturnOrderActions,
} from '../services/return-order';
import type { ReturnOrderStatus } from '../services/return-order';

/** 获取退货单列表 */
export const getReturnOrdersController = async (req: Request, res: Response) => {
  try {
    const keyword = req.query.keyword as string;
    const status = req.query.status as ReturnOrderStatus | undefined;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;

    const result = await getReturnOrders({ keyword, status, startDate, endDate, page, pageSize });
    res.json(result);
  } catch (error) {
    console.error('获取退货单列表失败:', error);
    res.status(500).json({ error: '获取退货单列表失败', message: error instanceof Error ? error.message : '未知错误' });
  }
};

/** 获取退货单详情 */
export const getReturnOrderByIdController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const result = await getReturnOrderById(id);
    res.json(result);
  } catch (error) {
    console.error('获取退货单详情失败:', error);
    res.status(500).json({ error: '获取退货单详情失败', message: error instanceof Error ? error.message : '未知错误' });
  }
};

/** 获取退货单统计 */
export const getReturnOrderStatsController = async (req: Request, res: Response) => {
  try {
    const result = await getReturnOrderStats();
    res.json(result);
  } catch (error) {
    console.error('获取退货单统计失败:', error);
    res.status(500).json({ error: '获取退货单统计失败', message: error instanceof Error ? error.message : '未知错误' });
  }
};

/** 获取待填写ERP退货单列表 */
export const getPendingErpOrdersController = async (req: Request, res: Response) => {
  try {
    const result = await getPendingErpOrders();
    res.json(result);
  } catch (error) {
    console.error('获取待填写ERP退货单列表失败:', error);
    res.status(500).json({ error: '获取待填写ERP退货单列表失败', message: error instanceof Error ? error.message : '未知错误' });
  }
};

/** 获取退货单操作记录 */
export const getReturnOrderActionsController = async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const result = await getReturnOrderActions(orderId);
    res.json(result);
  } catch (error) {
    console.error('获取退货单操作记录失败:', error);
    res.status(500).json({ error: '获取退货单操作记录失败', message: error instanceof Error ? error.message : '未知错误' });
  }
};
