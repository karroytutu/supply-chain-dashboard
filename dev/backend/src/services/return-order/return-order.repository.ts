/**
 * 退货单 - 数据访问层 (Repository)
 * 收敛所有 SQL 查询和缓存逻辑，Service 层不再直接编写 SQL
 * 遵循规范：Controller → Service → Repository → DB
 */

import { query } from '../../db/pool';
import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import type {
  ReturnOrderQueryParams,
  ReturnOrderStatus,
} from './return-order.types';
import type { ReturnOrderRow } from './return-order-utils';

const CACHE_PREFIX = 'return:order';

// ==================== 读取操作 ====================

/**
 * 获取退货单列表（分页 + 库存关联）
 */
export async function getOrders(params: ReturnOrderQueryParams) {
  const { page = 1, pageSize = 20, keyword, status, startDate, endDate } = params;
  const offset = (page - 1) * pageSize;
  const conditions: string[] = ['1=1'];
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`ro.status = $${paramIndex++}`);
    queryParams.push(status);
  }
  if (keyword) {
    conditions.push(`(ro.goods_name ILIKE $${paramIndex} OR ro.return_no ILIKE $${paramIndex} OR ro.source_bill_no ILIKE $${paramIndex} OR ro.consumer_name ILIKE $${paramIndex})`);
    queryParams.push(`%${keyword}%`);
    paramIndex++;
  }
  if (startDate) {
    conditions.push(`ro.return_date >= $${paramIndex++}`);
    queryParams.push(startDate);
  }
  if (endDate) {
    conditions.push(`ro.return_date <= $${paramIndex++}`);
    queryParams.push(endDate);
  }

  const whereClause = conditions.join(' AND ');

  // 缓存 key 基于查询参数
  const cacheKey = `${CACHE_PREFIX}:list:${JSON.stringify({ page, pageSize, keyword, status, startDate, endDate })}`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return cached;

  // 查询总数
  const countResult = await appQuery<{ total: number }>(
    `SELECT COUNT(*) as total FROM expiring_return_orders ro WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0]?.total as any) || 0;

  // 查询列表 - 动态计算当前剩余保质期
  const listParams = [...queryParams, pageSize, offset];
  const result = await appQuery<ReturnOrderRow>(
    `SELECT
      ro.*,
      eu.name as erp_filler_name,
      wu.name as warehouse_executor_name,
      mu.name as marketing_completer_name,
      CASE
        WHEN ro.batch_date IS NOT NULL AND ro.shelf_life IS NOT NULL THEN
          EXTRACT(DAY FROM (ro.batch_date + ro.shelf_life * INTERVAL '1 day') - CURRENT_DATE)::int
        ELSE NULL
      END as calculated_days_to_expire
    FROM expiring_return_orders ro
    LEFT JOIN users eu ON ro.erp_filled_by = eu.id
    LEFT JOIN users wu ON ro.warehouse_executed_by = wu.id
    LEFT JOIN users mu ON ro.marketing_completed_by = mu.id
    WHERE ${whereClause}
    ORDER BY ro.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    listParams
  );

  // 批量查询残次品库存
  const rows = result.rows;
  await enrichStockData(rows);

  const data = {
    data: rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };

  cache.set(cacheKey, data, CACHE_TTL.DASHBOARD);
  return data;
}

/**
 * 获取退货单详情
 */
export async function getOrderById(id: number) {
  const cacheKey = `${CACHE_PREFIX}:detail:${id}`;
  const cached = cache.get<ReturnOrderRow>(cacheKey);
  if (cached) return cached;

  const result = await appQuery<ReturnOrderRow>(
    `SELECT
      ro.*,
      eu.name as erp_filler_name,
      wu.name as warehouse_executor_name,
      mu.name as marketing_completer_name,
      CASE
        WHEN ro.batch_date IS NOT NULL AND ro.shelf_life IS NOT NULL THEN
          EXTRACT(DAY FROM (ro.batch_date + ro.shelf_life * INTERVAL '1 day') - CURRENT_DATE)::int
        ELSE NULL
      END as calculated_days_to_expire
    FROM expiring_return_orders ro
    LEFT JOIN users eu ON ro.erp_filled_by = eu.id
    LEFT JOIN users wu ON ro.warehouse_executed_by = wu.id
    LEFT JOIN users mu ON ro.marketing_completed_by = mu.id
    WHERE ro.id = $1`,
    [id]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  cache.set(cacheKey, row, CACHE_TTL.DASHBOARD);
  return row;
}

/**
 * 获取退货单统计
 */
export async function getStats() {
  const cacheKey = `${CACHE_PREFIX}:stats`;
  const cached = cache.get<any>(cacheKey);
  if (cached) return cached;

  const result = await appQuery(
    `SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'pending_confirm' THEN 1 END) as pending_confirm,
      COUNT(CASE WHEN status = 'pending_erp_fill' THEN 1 END) as pending_erp_fill,
      COUNT(CASE WHEN status = 'pending_warehouse_execute' THEN 1 END) as pending_warehouse_execute,
      COUNT(CASE WHEN status = 'pending_marketing_sale' THEN 1 END) as pending_marketing_sale,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
    FROM expiring_return_orders`
  );

  cache.set(cacheKey, result.rows[0], CACHE_TTL.DASHBOARD);
  return result.rows[0];
}

/**
 * 获取待填写ERP退货单的列表
 */
export async function getPendingErpOrders() {
  const cacheKey = `${CACHE_PREFIX}:pending_erp`;
  const cached = cache.get<any[]>(cacheKey);
  if (cached) return cached;

  const result = await appQuery(
    `SELECT
      id, return_no, goods_id, goods_name, quantity, unit,
      batch_date, return_date, expire_date, shelf_life, days_to_expire, days_to_expire_at_return,
      status, source_bill_no, consumer_name, marketing_manager, created_at, updated_at
    FROM expiring_return_orders
    WHERE status = 'pending_erp_fill'
    ORDER BY created_at ASC`
  );

  cache.set(cacheKey, result.rows, CACHE_TTL.DASHBOARD);
  return result.rows;
}

/**
 * 获取退货单操作记录
 */
export async function getActions(orderId: number) {
  const cacheKey = `${CACHE_PREFIX}:actions:${orderId}`;
  const cached = cache.get<any[]>(cacheKey);
  if (cached) return cached;

  const result = await appQuery(
    `SELECT * FROM expiring_return_actions
     WHERE order_id = $1
     ORDER BY action_at DESC`,
    [orderId]
  );

  cache.set(cacheKey, result.rows, CACHE_TTL.DASHBOARD);
  return result.rows;
}

/**
 * 获取退货单当前状态
 */
export async function getOrderStatus(id: number): Promise<string | null> {
  const result = await appQuery<{ status: string }>(
    'SELECT status FROM expiring_return_orders WHERE id = $1',
    [id]
  );
  return result.rows.length > 0 ? result.rows[0].status : null;
}

/**
 * 根据ID获取退货单原始行（不含关联信息，用于通知等场景）
 */
export async function getRawOrderById(id: number) {
  const result = await appQuery<ReturnOrderRow>(
    'SELECT * FROM expiring_return_orders WHERE id = $1',
    [id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

// ==================== 写入操作 ====================

/**
 * 创建退货单
 */
export async function createOrder(params: any): Promise<ReturnOrderRow> {
  const {
    returnNo, goodsId, goodsName, quantity, unit,
    batchDate, returnDate, expireDate, shelfLife, daysToExpire, daysToExpireAtReturn,
    sourceBillNo, consumerName, marketingManager, status, purchasePrice,
  } = params;

  const orderStatus = status || 'pending_confirm';
  const daysAtReturn = daysToExpireAtReturn ?? daysToExpire;

  const result = await appQuery<ReturnOrderRow>(
    `INSERT INTO expiring_return_orders
     (return_no, goods_id, goods_name, quantity, unit, batch_date, return_date,
      expire_date, shelf_life, days_to_expire, days_to_expire_at_return, source_bill_no,
      consumer_name, marketing_manager, status, purchase_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      returnNo, goodsId, goodsName, quantity, unit || null,
      batchDate || null, returnDate || null, expireDate || null,
      shelfLife || null, daysToExpire ?? null, daysAtReturn ?? null,
      sourceBillNo || null, consumerName || null, marketingManager || null,
      orderStatus, purchasePrice || null,
    ]
  );

  return result.rows[0];
}

/**
 * 记录操作日志
 */
export async function recordAction(
  orderId: number,
  actionType: string,
  operatorId: number | null,
  operatorName: string,
  comment?: string,
  details?: Record<string, any>
): Promise<void> {
  await appQuery(
    `INSERT INTO expiring_return_actions
     (order_id, action_type, operator_id, operator_name, comment, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, actionType, operatorId, operatorName, comment || null, details || null]
  );
}

/**
 * 记录创建操作（无操作人）
 */
export async function recordCreateAction(orderId: number): Promise<void> {
  await appQuery(
    `INSERT INTO expiring_return_actions (order_id, action_type, action_at)
     VALUES ($1, 'create', NOW())`,
    [orderId]
  );
}

/**
 * 更新退货单状态
 */
export async function updateStatus(id: number, status: string): Promise<ReturnOrderRow | null> {
  const result = await appQuery<ReturnOrderRow>(
    `UPDATE expiring_return_orders
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 批量确认退货单
 */
export async function batchConfirm(
  newStatus: ReturnOrderStatus,
  operatorId: number,
  orderIds: number[]
): Promise<{ id: number; goods_id: string; goods_name: string }[]> {
  const result = await appQuery<{ id: number; goods_id: string; goods_name: string }>(
    `UPDATE expiring_return_orders
     SET status = $1, rule_confirmed_at = NOW(), rule_confirmed_by = $2, updated_at = NOW()
     WHERE id = ANY($3) AND status = 'pending_confirm'
     RETURNING id, goods_id, goods_name`,
    [newStatus, operatorId, orderIds]
  );
  return result.rows;
}

/**
 * 填写ERP退货单号
 */
export async function fillErpReturnNo(id: number, erpReturnNo: string, operatorId: number): Promise<ReturnOrderRow | null> {
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
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 仓储执行退货
 */
export async function warehouseExecute(id: number, operatorId: number, evidenceUrlJson: string, comment: string | null): Promise<ReturnOrderRow | null> {
  const result = await appQuery<ReturnOrderRow>(
    `UPDATE expiring_return_orders
     SET warehouse_executed_by = $1,
         warehouse_executed_at = NOW(),
         warehouse_evidence_url = $2,
         warehouse_comment = $3,
         status = 'completed',
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [operatorId, evidenceUrlJson, comment, id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 营销销售完成
 */
export async function marketingSaleComplete(id: number, operatorId: number, comment: string | null): Promise<ReturnOrderRow | null> {
  const result = await appQuery<ReturnOrderRow>(
    `UPDATE expiring_return_orders
     SET marketing_completed_by = $1,
         marketing_completed_at = NOW(),
         marketing_comment = $2,
         status = 'completed',
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [operatorId, comment, id]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 回退退货单到 pending_confirm
 */
export async function rollbackOrder(id: number): Promise<ReturnOrderRow | null> {
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
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 自动完成营销销售（定时任务用）
 */
export async function autoCompleteMarketingSale(): Promise<{
  checkedCount: number;
  completedCount: number;
}> {
  // 查询所有 pending_marketing_sale 的退货单
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
    return { checkedCount: 0, completedCount: 0 };
  }

  // 获取商品名称列表，查询残次品库存
  const goodsNames = pendingOrders.map(order => order.goods_name);
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

  const stockMap = new Map<string, number>();
  stockResult.rows.forEach(row => {
    stockMap.set(row.goodsName, parseFloat(row.total_quantity as any) || 0);
  });

  let completedCount = 0;
  for (const order of pendingOrders) {
    const stockQuantity = stockMap.get(order.goods_name) || 0;
    if (stockQuantity <= 0) {
      await appQuery(
        `UPDATE expiring_return_orders
         SET status = 'completed',
             marketing_completed_at = NOW(),
             marketing_comment = '系统自动检测：残次品库存已清零',
             updated_at = NOW()
         WHERE id = $1`,
        [order.id]
      );
      await recordAction(order.id, 'marketing_complete', null, '系统自动检测', '残次品库存已清零，自动完成销售');
      completedCount++;
    }
  }

  return { checkedCount, completedCount };
}

// ==================== 库存数据补充 ====================

/**
 * 批量查询残次品库存并附加到退货单行
 */
async function enrichStockData(rows: ReturnOrderRow[]): Promise<void> {
  if (rows.length === 0) return;

  const goodsNames = [...new Set(rows.map(row => row.goods_name))];
  const stockByGoods = new Map<string, Map<string, number>>();
  const unitInfoMap = new Map<string, { pkgUnit: string; baseUnit: string; unitFactor: number }>();

  try {
    // 1. 查询商品档案获取换算信息
    const unitInfoResult = await query<{
      name: string;
      pkgUnitName: string | null;
      baseUnitName: string | null;
      unitFactor: number | null;
    }>(
      `SELECT name, "pkgUnitName", "baseUnitName", "unitFactor"
       FROM "商品档案"
       WHERE name = ANY($1)`,
      [goodsNames]
    );

    unitInfoResult.rows.forEach(row => {
      if (row.name) {
        unitInfoMap.set(row.name, {
          pkgUnit: row.pkgUnitName || '',
          baseUnit: row.baseUnitName || '',
          unitFactor: row.unitFactor || 1,
        });
      }
    });

    // 2. 查询库存
    const stockResult = await query<{
      goodsName: string;
      unitName: string;
      total_quantity: number;
    }>(
      `SELECT "goodsName", "unitName", SUM("quantity") as total_quantity
       FROM "独山云仓批次库存表"
       WHERE "goodsName" = ANY($1)
         AND "qualityTypeStr" = '残次品'
       GROUP BY "goodsName", "unitName"`,
      [goodsNames]
    );

    stockResult.rows.forEach(row => {
      if (!stockByGoods.has(row.goodsName)) {
        stockByGoods.set(row.goodsName, new Map());
      }
      stockByGoods.get(row.goodsName)!.set(
        row.unitName,
        parseFloat(row.total_quantity as any) || 0
      );
    });
  } catch (error) {
    console.error('[ReturnOrder] 查询库存失败:', error);
  }

  // 合并库存数据到退货单行
  for (const row of rows) {
    const stockUnits = stockByGoods.get(row.goods_name);
    const unitInfo = unitInfoMap.get(row.goods_name);
    const stockDisplay = convertStockDisplay(stockUnits!, row.unit, unitInfo);
    row.current_stock = stockDisplay?.quantity ?? null;
    (row as any).current_stock_display = stockDisplay?.displayText ?? null;
    (row as any).current_stock_unit = stockDisplay?.unit ?? null;
  }
}

/**
 * 根据退货单单位和换算信息，智能转换库存显示
 */
function convertStockDisplay(
  stockUnits: Map<string, number>,
  returnOrderUnit: string | null,
  unitInfo: { pkgUnit: string; baseUnit: string; unitFactor: number } | undefined
): { quantity: number; unit: string; displayText: string } | null {
  if (!stockUnits || stockUnits.size === 0) return null;
  if (!returnOrderUnit) return null;

  const pkgQty = unitInfo?.pkgUnit ? (stockUnits.get(unitInfo.pkgUnit) || 0) : 0;
  const baseQty = unitInfo?.baseUnit ? (stockUnits.get(unitInfo.baseUnit) || 0) : 0;
  const unitFactor = unitInfo?.unitFactor || 1;
  const totalBaseQty = pkgQty * unitFactor + baseQty;

  if (returnOrderUnit === unitInfo?.baseUnit) {
    return {
      quantity: totalBaseQty,
      unit: unitInfo.baseUnit,
      displayText: `${totalBaseQty}${unitInfo.baseUnit}`,
    };
  }

  if (returnOrderUnit === unitInfo?.pkgUnit && unitFactor > 1) {
    const displayPkgQty = Math.floor(totalBaseQty / unitFactor);
    const displayBaseQty = totalBaseQty % unitFactor;

    if (displayPkgQty > 0 && displayBaseQty > 0) {
      return {
        quantity: totalBaseQty / unitFactor,
        unit: `${unitInfo.pkgUnit}${unitInfo.baseUnit}`,
        displayText: `${displayPkgQty}${unitInfo.pkgUnit}${displayBaseQty}${unitInfo.baseUnit}`,
      };
    } else if (displayPkgQty > 0) {
      return {
        quantity: displayPkgQty,
        unit: unitInfo.pkgUnit,
        displayText: `${displayPkgQty}${unitInfo.pkgUnit}`,
      };
    } else {
      return {
        quantity: displayBaseQty,
        unit: unitInfo.baseUnit,
        displayText: `${displayBaseQty}${unitInfo.baseUnit}`,
      };
    }
  }

  const matchedQty = stockUnits.get(returnOrderUnit);
  if (matchedQty !== undefined && matchedQty > 0) {
    return {
      quantity: matchedQty,
      unit: returnOrderUnit,
      displayText: `${matchedQty}${returnOrderUnit}`,
    };
  }

  return null;
}

// ==================== 缓存失效 ====================

/**
 * 失效指定退货单相关的所有缓存
 * 写入操作（UPDATE/INSERT/DELETE）后调用
 */
export function invalidateOrderCache(orderId?: number): void {
  cache.invalidate(`${CACHE_PREFIX}:list:`);
  cache.invalidate(`${CACHE_PREFIX}:stats`);
  cache.invalidate(`${CACHE_PREFIX}:pending_erp`);

  if (orderId) {
    cache.invalidate(`${CACHE_PREFIX}:detail:${orderId}`);
    cache.invalidate(`${CACHE_PREFIX}:actions:${orderId}`);
  }
}
