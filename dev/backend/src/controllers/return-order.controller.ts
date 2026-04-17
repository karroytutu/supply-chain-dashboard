/**
 * 退货单操作控制器
 * @module controllers/return-order.controller
 */

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

/** 批量确认退货单 */
export const batchConfirmReturnOrdersController = async (req: Request, res: Response) => {
  try {
    const { orderIds, ruleDecision } = req.body;
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json({ error: '未登录', message: '无法获取操作人信息' });
      return;
    }

    const result = await batchConfirmReturnOrders({ orderIds, ruleDecision, operatorId, operatorName });
    res.json(result);
  } catch (error) {
    console.error('批量确认退货单失败:', error);
    res.status(500).json({ error: '批量确认退货单失败', message: error instanceof Error ? error.message : '未知错误' });
  }
};

/** 取消退货单 */
export const cancelReturnOrderController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const operatorId = req.user?.userId;
    const operatorName = req.user?.name;

    if (!operatorId || !operatorName) {
      res.status(401).json({ error: '未登录', message: '无法获取操作人信息' });
      return;
    }

    const result = await cancelReturnOrder(id, operatorId, operatorName);
    res.json(result);
  } catch (error) {
    console.error('取消退货单失败:', error);
    res.status(500).json({ error: '取消退货单失败', message: error instanceof Error ? error.message : '未知错误' });
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
      res.status(401).json({ error: '未登录', message: '无法获取操作人信息' });
      return;
    }

    if (!erpReturnNo || typeof erpReturnNo !== 'string') {
      res.status(400).json({ error: '参数错误', message: 'ERP退货单号不能为空' });
      return;
    }

    const result = await fillErpReturnNo({ id, erpReturnNo, operatorId, operatorName });
    res.json(result);
  } catch (error) {
    console.error('填写ERP退货单号失败:', error);
    res.status(500).json({ error: '填写ERP退货单号失败', message: error instanceof Error ? error.message : '未知错误' });
  }
};

/** 上传退货凭证图片（支持多文件，最多9张） */
export const uploadReturnEvidenceController = async (req: Request, res: Response) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      res.status(400).json({ error: '参数错误', message: '未上传文件' });
      return;
    }

    const urls = (req.files as Express.Multer.File[]).map(
      file => `/uploads/return-evidence/${file.filename}`
    );
    res.json({ success: true, urls });
  } catch (error) {
    console.error('上传退货凭证失败:', error);
    res.status(500).json({ error: '上传退货凭证失败', message: error instanceof Error ? error.message : '未知错误' });
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
      res.status(401).json({ error: '未登录', message: '无法获取操作人信息' });
      return;
    }

    if (!evidenceUrls || !Array.isArray(evidenceUrls) || evidenceUrls.length === 0) {
      res.status(400).json({ error: '参数错误', message: '请先上传退货凭证图片' });
      return;
    }

    const result = await warehouseExecute({ id, evidenceUrls, comment, operatorId, operatorName });
    res.json(result);
  } catch (error) {
    console.error('仓储执行退货失败:', error);
    res.status(500).json({ error: '仓储执行退货失败', message: error instanceof Error ? error.message : '未知错误' });
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
      res.status(401).json({ error: '未登录', message: '无法获取操作人信息' });
      return;
    }

    const result = await marketingSaleComplete({ id, comment, operatorId, operatorName });
    res.json(result);
  } catch (error) {
    console.error('营销销售完成处理失败:', error);
    res.status(500).json({ error: '营销销售完成处理失败', message: error instanceof Error ? error.message : '未知错误' });
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
      res.status(401).json({ error: '未登录', message: '无法获取操作人信息' });
      return;
    }

    const result = await rollbackReturnOrder({ id, operatorId, operatorName, comment });
    res.json(result);
  } catch (error) {
    console.error('回退退货单失败:', error);
    res.status(500).json({ error: '回退退货单失败', message: error instanceof Error ? error.message : '未知错误' });
  }
};

/** 手动触发同步退货数据 */
export const triggerSyncController = async (req: Request, res: Response) => {
  try {
    console.log('[TriggerSync] 手动触发退货数据同步...');
    const result = await syncReturnOrders();
    console.log('[TriggerSync] 同步完成:', result);
    res.json({ success: true, message: '同步完成', data: result });
  } catch (error) {
    console.error('[TriggerSync] 同步失败:', error);
    res.status(500).json({ error: '同步失败', message: error instanceof Error ? error.message : '未知错误' });
  }
};
