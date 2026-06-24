/**
 * 开发环境 ERP 清理路由
 * 仅在 NODE_ENV=development 时注册，供 E2E 测试清理 ERP 生产数据
 * @module routes/dev-erp-cleanup.routes
 */
import { Router, type Request, type Response } from 'express';
import { beijingDate } from '../utils/beijingTime';
import { authMiddleware } from '../middleware/auth';
import { cancelPurchaseOrder, createPurchaseOrder } from '../services/erp-client/erp-purchase.service';
import { processOaAsyncTasks } from '../services/oa/oa-async-task.service';

const router = Router();

// 所有端点需要认证
router.use(authMiddleware);

/**
 * POST /cancel-po
 * 取消ERP中的采购订单（用于E2E测试兜底清理）
 * Body: { billId: number }
 */
router.post('/cancel-po', async (req: Request, res: Response) => {
  const { billId } = req.body;

  if (!billId || typeof billId !== 'number' || billId <= 0) {
    res.status(400).json({
      code: 400,
      message: 'billId 必须为正整数',
      data: null,
    });
    return;
  }

  try {
    await cancelPurchaseOrder(billId);
    res.json({
      code: 200,
      message: `采购订单 ${billId} 已取消`,
      data: { billId },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      code: 500,
      message: `取消采购订单失败: ${errMsg}`,
      data: null,
    });
  }
});

/**
 * POST /create-test-po
 * 创建测试采购订单（用于E2E测试数据准备）
 * Body: { supplierId, warehouseId, salesmanId?, deptId?, details, remark? }
 */
router.post('/create-test-po', async (req: Request, res: Response) => {
  const { supplierId, warehouseId, salesmanId, deptId, details, remark } = req.body;

  if (!supplierId || !warehouseId || !details?.length) {
    res.status(400).json({
      code: 400,
      message: '缺少必填参数: supplierId, warehouseId, details',
      data: null,
    });
    return;
  }

  try {
    const today = beijingDate();
    const result = await createPurchaseOrder({
      supplierId,
      warehouseId,
      salesmanId: salesmanId || 1,
      deptId,
      workDate: today,
      remark: remark || '[E2E测试]',
      billType: 'PURCHASE_ORDER',
      details,
    });
    res.json({
      code: 200,
      message: `测试采购订单已创建: ${result.billStr}`,
      data: result,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      code: 500,
      message: `创建测试采购订单失败: ${errMsg}`,
      data: null,
    });
  }
});

/**
 * POST /flush-async-tasks
 * 立即处理所有待执行的异步任务（auto节点、通知等）
 * 绕过 cron 定时等待（最长60秒），供 E2E 测试快速推进流程
 */
router.post('/flush-async-tasks', async (_req: Request, res: Response) => {
  try {
    const result = await processOaAsyncTasks(50);
    res.json({
      code: 200,
      message: `异步任务已处理: processed=${result.processed}, failed=${result.failed}`,
      data: result,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      code: 500,
      message: `处理异步任务失败: ${errMsg}`,
      data: null,
    });
  }
});

export default router;
