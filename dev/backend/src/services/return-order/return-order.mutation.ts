/**
 * 退货单变更服务
 * 业务逻辑层，委托 Repository 执行数据访问，写入后自动失效缓存
 */

import { appQuery } from '../../db/appPool';
import * as repo from './return-order.repository';
import { toReturnOrderDTO } from './return-order.mapper';
import {
  notifyPendingErpFill,
  notifyPendingMarketingSale,
  notifyPendingWarehouseExecute,
} from './return-order-notify';
// [统一考核迁移] 旧模块已停用，由统一考核模块替代
// import { createReturnExpireInsufficientPenalty } from '../return-penalty';
import { runCalculation } from '../assessment/assessment-calculate';
import { RETURN_EXPIRE_INSUFFICIENT_DAYS } from '../../utils/constants';
import { createGoodsReturnRule } from '../goods-return-rules';
import type {
  ReturnOrder,
  ReturnOrderStatus,
  CreateReturnOrderParams,
  BatchConfirmReturnOrdersParams,
  BatchConfirmResult,
  UpdateStatusParams,
  FillErpReturnNoParams,
  WarehouseExecuteParams,
  MarketingSaleCompleteParams,
  RollbackReturnOrderParams,
} from './return-order.types';

/**
 * 创建退货单
 */
export async function createReturnOrder(
  params: CreateReturnOrderParams
): Promise<ReturnOrder | null> {
  const row = await repo.createOrder(params);

  // ON CONFLICT DO NOTHING 时返回 null，表示记录已存在
  if (!row) {
    return null;
  }

  // 记录创建操作
  await repo.recordCreateAction(row.id);

  repo.invalidateOrderCache(row.id);
  return toReturnOrderDTO(row);
}

/**
 * 更新退货单状态
 */
export async function updateReturnOrderStatus(
  params: UpdateStatusParams
): Promise<ReturnOrder | null> {
  const { id, status, operatorId, operatorName, comment } = params;

  // 获取当前状态用于记录
  const previousStatus = await repo.getOrderStatus(id);
  if (!previousStatus) return null;

  // 更新状态
  const row = await repo.updateStatus(id, status);
  if (!row) return null;

  // 记录操作日志
  await repo.recordAction(id, 'confirm_rule', operatorId, operatorName, comment, {
    previousStatus,
    newStatus: status,
  });

  repo.invalidateOrderCache(id);
  return toReturnOrderDTO(row);
}

/**
 * 批量确认退货单
 * 根据规则决定走 pending_erp_fill 还是 pending_marketing_sale
 */
export async function batchConfirmReturnOrders(
  params: BatchConfirmReturnOrdersParams
): Promise<BatchConfirmResult> {
  const { orderIds, ruleDecision, operatorId, operatorName } = params;

  if (!orderIds || orderIds.length === 0) {
    return { successCount: 0, failedCount: 0 };
  }

  const newStatus: ReturnOrderStatus =
    ruleDecision === 'can_return' ? 'pending_erp_fill' : 'pending_marketing_sale';

  // 批量更新状态
  const confirmedRows = await repo.batchConfirm(newStatus, operatorId, orderIds);
  const successCount = confirmedRows.length;

  // 为每个确认的退货单创建商品退货规则
  for (const row of confirmedRows) {
    try {
      await createGoodsReturnRule({
        goodsId: row.goods_id,
        goodsName: row.goods_name,
        canReturnToSupplier: ruleDecision === 'can_return',
        userId: operatorId,
        comment: ruleDecision === 'can_return' ? '可采购退货' : '不可采购退货',
      });
    } catch (ruleError) {
      console.error(`[ReturnOrder] 创建商品退货规则失败: ${row.goods_id}`, ruleError);
    }
  }

  // 批量记录操作日志并发送通知
  for (const row of confirmedRows) {
    await repo.recordAction(row.id, 'confirm_rule', operatorId, operatorName, undefined, {
      ruleDecision,
      newStatus,
    });

    try {
      const orderRow = await repo.getRawOrderById(row.id);
      if (orderRow) {
        const order = toReturnOrderDTO(orderRow);

        // 检查规则3：退货时保质期不足考核（统一考核模块）
        if (order.daysToExpireAtReturn && order.daysToExpireAtReturn < RETURN_EXPIRE_INSUFFICIENT_DAYS) {
          runCalculation({
            triggered_by: 'realtime',
            category: 'return_order',
            rule_type: 'return_expire_insufficient',
            source_id: order.id,
          }).catch(error => {
            console.error('[Assessment] 退货保质期不足考核计算失败:', error);
          });
        }

        if (newStatus === 'pending_erp_fill') {
          notifyPendingErpFill(order).catch(error => {
            console.error('[DingTalk] 待填写ERP通知失败:', error);
          });
        } else if (newStatus === 'pending_marketing_sale') {
          notifyPendingMarketingSale(order).catch(error => {
            console.error('[DingTalk] 待营销处理通知失败:', error);
          });
        }
      }
    } catch (notifyError) {
      console.error('[DingTalk] 确认后通知失败:', notifyError);
    }
  }

  repo.invalidateOrderCache();
  return {
    successCount,
    failedCount: orderIds.length - successCount,
  };
}

/**
 * 取消退货单
 */
export async function cancelReturnOrder(
  id: number,
  operatorId: number,
  operatorName: string,
  comment?: string
): Promise<ReturnOrder | null> {
  const currentStatus = await repo.getOrderStatus(id);
  if (!currentStatus) return null;

  // 只有 pending_confirm 和 pending_erp_fill 状态可以取消
  if (!['pending_confirm', 'pending_erp_fill'].includes(currentStatus)) {
    return null;
  }

  const row = await repo.updateStatus(id, 'cancelled');
  if (!row) return null;

  await repo.recordAction(id, 'cancel', operatorId, operatorName, comment, {
    previousStatus: currentStatus,
  });

  repo.invalidateOrderCache(id);
  return toReturnOrderDTO(row);
}

/**
 * 填写ERP退货单号
 * 状态: pending_erp_fill -> pending_warehouse_execute
 */
export async function fillErpReturnNo(
  params: FillErpReturnNoParams
): Promise<ReturnOrder> {
  const { id, erpReturnNo, operatorId, operatorName } = params;

  const currentStatus = await repo.getOrderStatus(id);
  if (!currentStatus) {
    throw new Error('退货单不存在');
  }
  if (currentStatus !== 'pending_erp_fill') {
    throw new Error(`当前状态为 ${currentStatus}，无法填写ERP退货单号`);
  }

  const row = await repo.fillErpReturnNo(id, erpReturnNo, operatorId);
  if (!row) {
    throw new Error('更新退货单失败');
  }

  await repo.recordAction(id, 'erp_fill', operatorId, operatorName, undefined, {
    erpReturnNo,
    previousStatus: currentStatus,
    newStatus: 'pending_warehouse_execute',
  });

  const returnOrder = toReturnOrderDTO(row);
  repo.invalidateOrderCache(id);

  // 发送钉钉通知给仓储人员
  notifyPendingWarehouseExecute(returnOrder, erpReturnNo).catch(error => {
    console.error('[DingTalk] 待仓储执行通知失败:', error);
  });

  return returnOrder;
}

/**
 * 仓储执行退货
 * 状态: pending_warehouse_execute -> completed
 */
export async function warehouseExecute(
  params: WarehouseExecuteParams
): Promise<ReturnOrder> {
  const { id, evidenceUrls, comment, operatorId, operatorName } = params;

  const currentStatus = await repo.getOrderStatus(id);
  if (!currentStatus) {
    throw new Error('退货单不存在');
  }
  if (currentStatus !== 'pending_warehouse_execute') {
    throw new Error(`当前状态为 ${currentStatus}，无法执行仓储退货`);
  }

  const evidenceUrlJson = JSON.stringify(evidenceUrls);
  const row = await repo.warehouseExecute(id, operatorId, evidenceUrlJson, comment || null);
  if (!row) {
    throw new Error('更新退货单失败');
  }

  await repo.recordAction(id, 'warehouse_execute', operatorId, operatorName, comment, {
    evidenceUrls,
    previousStatus: currentStatus,
    newStatus: 'completed',
  });

  repo.invalidateOrderCache(id);
  return toReturnOrderDTO(row);
}

/**
 * 营销销售完成处理
 * 状态: pending_marketing_sale -> completed
 */
export async function marketingSaleComplete(
  params: MarketingSaleCompleteParams
): Promise<ReturnOrder> {
  const { id, comment, operatorId, operatorName } = params;

  const currentStatus = await repo.getOrderStatus(id);
  if (!currentStatus) {
    throw new Error('退货单不存在');
  }
  if (currentStatus !== 'pending_marketing_sale') {
    throw new Error(`当前状态为 ${currentStatus}，无法执行营销销售完成`);
  }

  const row = await repo.marketingSaleComplete(id, operatorId, comment || null);
  if (!row) {
    throw new Error('更新退货单失败');
  }

  await repo.recordAction(id, 'marketing_complete', operatorId, operatorName, comment, {
    previousStatus: currentStatus,
    newStatus: 'completed',
  });

  repo.invalidateOrderCache(id);
  return toReturnOrderDTO(row);
}

/**
 * 自动检查并完成销售
 * 根据云仓批次库存表中的残次品库存判断销售是否完成
 */
export async function autoCompleteMarketingSale(): Promise<{
  checkedCount: number;
  completedCount: number;
}> {
  const result = await repo.autoCompleteMarketingSale();
  if (result.completedCount > 0) {
    repo.invalidateOrderCache();
  }
  return result;
}

/**
 * 回退退货单
 * 将状态从 pending_erp_fill 或 pending_marketing_sale 回退到 pending_confirm
 */
export async function rollbackReturnOrder(
  params: RollbackReturnOrderParams
): Promise<ReturnOrder> {
  const { id, operatorId, operatorName, comment } = params;

  const currentStatus = await repo.getOrderStatus(id);
  if (!currentStatus) {
    throw new Error('退货单不存在');
  }
  if (!['pending_erp_fill', 'pending_marketing_sale'].includes(currentStatus)) {
    throw new Error(`当前状态为 ${currentStatus}，无法回退`);
  }

  const row = await repo.rollbackOrder(id);
  if (!row) {
    throw new Error('更新退货单失败');
  }

  await repo.recordAction(id, 'rollback', operatorId, operatorName, comment, {
    previousStatus: currentStatus,
    newStatus: 'pending_confirm',
  });

  repo.invalidateOrderCache(id);
  return toReturnOrderDTO(row);
}
