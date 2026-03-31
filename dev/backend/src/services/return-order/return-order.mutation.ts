/**
 * 退货单变更服务
 */

import { query } from '../../db/pool';
import { appQuery } from '../../db/appPool';
import { mapRowToReturnOrder, recordAction, type ReturnOrderRow } from './return-order-utils';
import {
  notifyPendingErpFill,
  notifyPendingMarketingSale,
  notifyPendingWarehouseExecute,
} from './return-order-notify';
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
): Promise<ReturnOrder> {
  const {
    returnNo, goodsId, goodsName, quantity, unit,
    batchDate, returnDate, expireDate, shelfLife, daysToExpire, daysToExpireAtReturn,
    sourceBillNo, consumerName, marketingManager, status,
  } = params;

  // 如果未传入status，使用默认值 'pending_confirm'
  const orderStatus = status || 'pending_confirm';

  // daysToExpireAtReturn 默认使用 daysToExpire 的值
  const daysAtReturn = daysToExpireAtReturn ?? daysToExpire;

  const result = await appQuery<ReturnOrderRow>(
    `INSERT INTO expiring_return_orders 
     (return_no, goods_id, goods_name, quantity, unit, batch_date, return_date,
      expire_date, shelf_life, days_to_expire, days_to_expire_at_return, source_bill_no, consumer_name, marketing_manager, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      returnNo, goodsId, goodsName, quantity, unit || null,
      batchDate || null, returnDate || null, expireDate || null,
      shelfLife || null, daysToExpire || null, daysAtReturn || null,
      sourceBillNo || null, consumerName || null, marketingManager || null,
      orderStatus,
    ]
  );

  const row = result.rows[0];

  // 记录创建操作
  await appQuery(
    `INSERT INTO expiring_return_actions (order_id, action_type, action_at)
     VALUES ($1, 'create', NOW())`,
    [row.id]
  );

  return mapRowToReturnOrder(row);
}

/**
 * 更新退货单状态
 */
export async function updateReturnOrderStatus(
  params: UpdateStatusParams
): Promise<ReturnOrder | null> {
  const { id, status, operatorId, operatorName, comment } = params;

  // 获取当前状态用于记录
  const currentResult = await appQuery<{ status: string }>(
    'SELECT status FROM expiring_return_orders WHERE id = $1',
    [id]
  );

  if (currentResult.rows.length === 0) return null;

  const previousStatus = currentResult.rows[0].status;

  // 更新状态
  const result = await appQuery<ReturnOrderRow>(
    `UPDATE expiring_return_orders 
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );

  if (result.rows.length === 0) return null;

  // 记录操作日志
  await recordAction(id, 'confirm_rule', operatorId, operatorName, comment, {
    previousStatus,
    newStatus: status,
  });

  return mapRowToReturnOrder(result.rows[0]);
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

  // 根据规则决定新状态
  const newStatus: ReturnOrderStatus =
    ruleDecision === 'can_return' ? 'pending_erp_fill' : 'pending_marketing_sale';

  // 批量更新状态
  const result = await appQuery<{ id: number }>(
    `UPDATE expiring_return_orders 
     SET status = $1, updated_at = NOW()
     WHERE id = ANY($2) AND status = 'pending_confirm'
     RETURNING id`,
    [newStatus, orderIds]
  );

  const successCount = result.rowCount ?? 0;

  // 批量记录操作日志并发送通知
  for (const row of result.rows) {
    await recordAction(row.id, 'confirm_rule', operatorId, operatorName, undefined, {
      ruleDecision,
      newStatus,
    });

    // 查询退货单详情并发送对应通知
    try {
      const orderResult = await appQuery<ReturnOrderRow>(
        'SELECT * FROM expiring_return_orders WHERE id = $1',
        [row.id]
      );
      if (orderResult.rows.length > 0) {
        const order = mapRowToReturnOrder(orderResult.rows[0]);
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
  // 检查当前状态
  const currentResult = await appQuery<{ status: string }>(
    'SELECT status FROM expiring_return_orders WHERE id = $1',
    [id]
  );

  if (currentResult.rows.length === 0) return null;

  const currentStatus = currentResult.rows[0].status;

  // 只有 pending_confirm 和 pending_erp_fill 状态可以取消
  if (!['pending_confirm', 'pending_erp_fill'].includes(currentStatus)) {
    return null;
  }

  // 更新状态
  const result = await appQuery<ReturnOrderRow>(
    `UPDATE expiring_return_orders 
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) return null;

  // 记录操作日志
  await recordAction(id, 'cancel', operatorId, operatorName, comment, {
    previousStatus: currentStatus,
  });

  return mapRowToReturnOrder(result.rows[0]);
}

/**
 * 填写ERP退货单号
 * 状态: pending_erp_fill -> pending_warehouse_execute
 */
export async function fillErpReturnNo(
  params: FillErpReturnNoParams
): Promise<ReturnOrder> {
  const { id, erpReturnNo, operatorId, operatorName } = params;

  // 验证退货单存在且状态为 pending_erp_fill
  const currentResult = await appQuery<{ status: string }>(
    'SELECT status FROM expiring_return_orders WHERE id = $1',
    [id]
  );

  if (currentResult.rows.length === 0) {
    throw new Error('退货单不存在');
  }

  const currentStatus = currentResult.rows[0].status;

  if (currentStatus !== 'pending_erp_fill') {
    throw new Error(`当前状态为 ${currentStatus}，无法填写ERP退货单号`);
  }

  // 更新ERP退货单号和相关字段
  const result = await appQuery<ReturnOrderRow>(
    `UPDATE expiring_return_orders 
     SET erp_return_no = $1,
         erp_filled_by = $2,
         erp_filled_at = NOW(),
         status = 'pending_warehouse_execute',
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [erpReturnNo, operatorId, id]
  );

  if (result.rows.length === 0) {
    throw new Error('更新退货单失败');
  }

  // 记录操作日志
  await recordAction(id, 'erp_fill', operatorId, operatorName, undefined, {
    erpReturnNo,
    previousStatus: currentStatus,
    newStatus: 'pending_warehouse_execute',
  });

  const returnOrder = mapRowToReturnOrder(result.rows[0]);

  // 发送钉钉通知给仓储人员（异步执行，不影响主流程）
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
  const { id, returnQuantity, comment, operatorId, operatorName } = params;

  // 验证退货单存在且状态为 pending_warehouse_execute
  const currentResult = await appQuery<{ status: string }>(
    'SELECT status FROM expiring_return_orders WHERE id = $1',
    [id]
  );

  if (currentResult.rows.length === 0) {
    throw new Error('退货单不存在');
  }

  const currentStatus = currentResult.rows[0].status;

  if (currentStatus !== 'pending_warehouse_execute') {
    throw new Error(`当前状态为 ${currentStatus}，无法执行仓储退货`);
  }

  // 更新仓储执行相关字段
  const result = await appQuery<ReturnOrderRow>(
    `UPDATE expiring_return_orders 
     SET warehouse_executed_by = $1,
         warehouse_executed_at = NOW(),
         warehouse_return_quantity = $2,
         warehouse_comment = $3,
         status = 'completed',
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [operatorId, returnQuantity, comment || null, id]
  );

  if (result.rows.length === 0) {
    throw new Error('更新退货单失败');
  }

  // 记录操作日志
  await recordAction(id, 'warehouse_execute', operatorId, operatorName, comment, {
    returnQuantity,
    previousStatus: currentStatus,
    newStatus: 'completed',
  });

  const returnOrder = mapRowToReturnOrder(result.rows[0]);

  return returnOrder;
}

/**
 * 营销销售完成处理
 * 状态: pending_marketing_sale -> completed
 */
export async function marketingSaleComplete(
  params: MarketingSaleCompleteParams
): Promise<ReturnOrder> {
  const { id, comment, operatorId, operatorName } = params;

  // 验证退货单存在且状态为 pending_marketing_sale
  const currentResult = await appQuery<{ status: string }>(
    'SELECT status FROM expiring_return_orders WHERE id = $1',
    [id]
  );

  if (currentResult.rows.length === 0) {
    throw new Error('退货单不存在');
  }

  const currentStatus = currentResult.rows[0].status;

  if (currentStatus !== 'pending_marketing_sale') {
    throw new Error(`当前状态为 ${currentStatus}，无法执行营销销售完成`);
  }

  // 更新营销销售完成相关字段
  const result = await appQuery<ReturnOrderRow>(
    `UPDATE expiring_return_orders 
     SET marketing_completed_by = $1,
         marketing_completed_at = NOW(),
         marketing_comment = $2,
         status = 'completed',
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [operatorId, comment || null, id]
  );

  if (result.rows.length === 0) {
    throw new Error('更新退货单失败');
  }

  // 记录操作日志
  await recordAction(id, 'marketing_complete', operatorId, operatorName, comment, {
    previousStatus: currentStatus,
    newStatus: 'completed',
  });

  const returnOrder = mapRowToReturnOrder(result.rows[0]);

  return returnOrder;
}

/**
 * 自动检查并完成销售
 * 根据云仓批次库存表中的残次品库存判断销售是否完成
 * 当残次品库存为0或不存在时，自动将退货单状态更新为 completed
 */
export async function autoCompleteMarketingSale(): Promise<{
  checkedCount: number;
  completedCount: number;
}> {
  console.log('[AutoComplete] 开始检查待营销销售的退货单...');

  // 1. 查询所有状态为 pending_marketing_sale 的退货单
  const pendingOrdersResult = await appQuery<{
    id: number;
    return_no: string;
    goods_name: string;
    quantity: number;
  }>(
    `SELECT id, return_no, goods_name, quantity
     FROM expiring_return_orders
     WHERE status = 'pending_marketing_sale'
     ORDER BY created_at ASC`,
    []
  );

  const pendingOrders = pendingOrdersResult.rows;
  const checkedCount = pendingOrders.length;

  if (checkedCount === 0) {
    console.log('[AutoComplete] 没有待营销销售的退货单');
    return { checkedCount: 0, completedCount: 0 };
  }

  console.log(`[AutoComplete] 查询到 ${checkedCount} 条待营销销售的退货单`);

  // 2. 获取所有待处理商品的名称列表
  const goodsNames = pendingOrders.map(order => order.goods_name);

  // 3. 查询云仓批次库存表中这些商品的残次品库存
  const stockResult = await query<{
    goodsName: string;
    total_quantity: number;
  }>(
    `SELECT "goodsName", SUM("quantity") as total_quantity
     FROM "独山云仓批次库存表"
     WHERE "goodsName" = ANY($1)
       AND "qualityTypeStr" = '残次品'
     GROUP BY "goodsName"`,
    [goodsNames]
  );

  // 构建库存映射表
  const stockMap = new Map<string, number>();
  stockResult.rows.forEach(row => {
    stockMap.set(row.goodsName, parseFloat(row.total_quantity as any) || 0);
  });

  // 4. 检查每个退货单的库存情况
  let completedCount = 0;

  for (const order of pendingOrders) {
    const stockQuantity = stockMap.get(order.goods_name) || 0;

    // 如果残次品库存为0，说明已销售完成
    if (stockQuantity <= 0) {
      console.log(`[AutoComplete] 检测到销售完成: ${order.return_no}, 商品: ${order.goods_name}, 库存: ${stockQuantity}`);

      try {
        // 自动更新状态为 completed
        await appQuery(
          `UPDATE expiring_return_orders
           SET status = 'completed',
               marketing_completed_at = NOW(),
               marketing_comment = '系统自动检测：残次品库存已清零',
               updated_at = NOW()
           WHERE id = $1`,
          [order.id]
        );

        // 记录操作日志
        await recordAction(order.id, 'marketing_complete', null, '系统自动检测', '残次品库存已清零，自动完成销售');

        completedCount++;
        console.log(`[AutoComplete] 自动完成销售: ${order.return_no}`);
      } catch (updateError) {
        console.error(`[AutoComplete] 更新退货单失败: ${order.return_no}`, updateError);
      }
    } else {
      console.log(`[AutoComplete] 仍有残次品库存: ${order.goods_name}, 数量: ${stockQuantity}`);
    }
  }

  console.log(`[AutoComplete] 检查完成，共检查 ${checkedCount} 条，自动完成 ${completedCount} 条`);
  return { checkedCount, completedCount };
}

/**
 * 回退退货单
 * 将状态从 pending_erp_fill 或 pending_marketing_sale 回退到 pending_confirm
 */
export async function rollbackReturnOrder(
  params: RollbackReturnOrderParams
): Promise<ReturnOrder> {
  const { id, operatorId, operatorName, comment } = params;

  // 验证退货单存在并获取当前状态
  const currentResult = await appQuery<{ status: string }>(
    'SELECT status FROM expiring_return_orders WHERE id = $1',
    [id]
  );

  if (currentResult.rows.length === 0) {
    throw new Error('退货单不存在');
  }

  const currentStatus = currentResult.rows[0].status;

  // 只有 pending_erp_fill 和 pending_marketing_sale 状态可以回退
  if (!['pending_erp_fill', 'pending_marketing_sale'].includes(currentStatus)) {
    throw new Error(`当前状态为 ${currentStatus}，无法回退`);
  }

  // 更新状态回退到 pending_confirm，并清除相关字段
  const result = await appQuery<ReturnOrderRow>(
    `UPDATE expiring_return_orders 
     SET status = 'pending_confirm',
         erp_return_no = NULL,
         erp_filled_by = NULL,
         erp_filled_at = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error('更新退货单失败');
  }

  // 记录操作日志
  await recordAction(id, 'rollback', operatorId, operatorName, comment, {
    previousStatus: currentStatus,
    newStatus: 'pending_confirm',
  });

  return mapRowToReturnOrder(result.rows[0]);
}
