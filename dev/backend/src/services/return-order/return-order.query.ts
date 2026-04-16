/**
 * 退货单查询服务
 */

import { query } from '../../db/pool';
import { appQuery } from '../../db/appPool';
import { mapRowToReturnOrder, type ReturnOrderRow } from './return-order-utils';
import type {
  ReturnOrder,
  ReturnOrderStatus,
  ReturnOrderQueryParams,
  ReturnOrderStats,
  ReturnOrderListResult,
  ReturnAction,
} from './return-order.types';

/** 列表查询字段 */
type ListRow = ReturnOrderRow;

/**
 * 获取退货单列表
 */
export async function getReturnOrders(
  params: ReturnOrderQueryParams
): Promise<ReturnOrderListResult> {
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
    conditions.push(`(ro.goods_name ILIKE $${paramIndex} OR ro.return_no ILIKE $${paramIndex} OR ro.source_bill_no ILIKE $${paramIndex})`);
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

  // 查询总数
  const countResult = await appQuery<{ total: number }>(
    `SELECT COUNT(*) as total FROM expiring_return_orders ro WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0]?.total as any) || 0;

  // 查询列表 - 动态计算当前剩余保质期
  const listParams = [...queryParams, pageSize, offset];
  const result = await appQuery<ListRow>(
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

  // 批量查询残次品库存（按商品名称分组，获取所有单位库存）
  const rows = result.rows;

  // 库存数据结构：商品名称 -> 各单位库存量
  const stockByGoods = new Map<string, Map<string, number>>();
  // 商品换算信息：商品名称 -> { pkgUnit, baseUnit, unitFactor }
  const unitInfoMap = new Map<string, { pkgUnit: string; baseUnit: string; unitFactor: number }>();

  if (rows.length > 0) {
    const goodsNames = [...new Set(rows.map(row => row.goods_name))];

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

      // 2. 查询库存（获取该商品所有单位的残次品库存）
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
  }

  /**
   * 根据退货单单位和换算信息，智能转换库存显示
   * 规则：
   * 1. 退货单单位是基本单位（如"包"）：直接显示包数量
   * 2. 退货单单位是包装单位（如"件"）：
   *    - 总包数 >= 换算系数：显示"X件Y包"
   *    - 总包数 < 换算系数：显示"Y包"
   */
  function convertStockDisplay(
    stockUnits: Map<string, number>,
    returnOrderUnit: string | null,
    unitInfo: { pkgUnit: string; baseUnit: string; unitFactor: number } | undefined
  ): { quantity: number; unit: string; displayText: string } | null {
    if (!stockUnits || stockUnits.size === 0) return null;
    if (!returnOrderUnit) return null;

    // 获取各单位库存
    const pkgQty = unitInfo?.pkgUnit ? (stockUnits.get(unitInfo.pkgUnit) || 0) : 0;
    const baseQty = unitInfo?.baseUnit ? (stockUnits.get(unitInfo.baseUnit) || 0) : 0;
    const unitFactor = unitInfo?.unitFactor || 1;

    // 将所有库存转换为基本单位
    const totalBaseQty = pkgQty * unitFactor + baseQty;

    // 如果退货单单位是基本单位，直接显示
    if (returnOrderUnit === unitInfo?.baseUnit) {
      return {
        quantity: totalBaseQty,
        unit: unitInfo.baseUnit,
        displayText: `${totalBaseQty}${unitInfo.baseUnit}`,
      };
    }

    // 如果退货单单位是包装单位，智能转换
    if (returnOrderUnit === unitInfo?.pkgUnit && unitFactor > 1) {
      const displayPkgQty = Math.floor(totalBaseQty / unitFactor);
      const displayBaseQty = totalBaseQty % unitFactor;

      if (displayPkgQty > 0 && displayBaseQty > 0) {
        // 有件有包
        return {
          quantity: totalBaseQty / unitFactor,
          unit: `${unitInfo.pkgUnit}${unitInfo.baseUnit}`,
          displayText: `${displayPkgQty}${unitInfo.pkgUnit}${displayBaseQty}${unitInfo.baseUnit}`,
        };
      } else if (displayPkgQty > 0) {
        // 只有件
        return {
          quantity: displayPkgQty,
          unit: unitInfo.pkgUnit,
          displayText: `${displayPkgQty}${unitInfo.pkgUnit}`,
        };
      } else {
        // 不足1件，显示包
        return {
          quantity: displayBaseQty,
          unit: unitInfo.baseUnit,
          displayText: `${displayBaseQty}${unitInfo.baseUnit}`,
        };
      }
    }

    // 其他情况，直接匹配单位库存
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

  // 合并库存数据到退货单
  const data = rows.map(row => {
    const stockUnits = stockByGoods.get(row.goods_name);
    const unitInfo = unitInfoMap.get(row.goods_name);
    const stockDisplay = convertStockDisplay(stockUnits!, row.unit, unitInfo);
    row.current_stock = stockDisplay?.quantity ?? null;
    (row as any).current_stock_display = stockDisplay?.displayText ?? null;
    (row as any).current_stock_unit = stockDisplay?.unit ?? null;
    return mapRowToReturnOrder(row);
  });

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * 获取退货单详情
 */
export async function getReturnOrderById(id: number): Promise<ReturnOrder | null> {
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
  return mapRowToReturnOrder(result.rows[0]);
}

/**
 * 获取退货单统计
 */
export async function getReturnOrderStats(): Promise<ReturnOrderStats> {
  const result = await appQuery<{
    pending_confirm: number;
    pending_erp_fill: number;
    pending_warehouse_execute: number;
    pending_marketing_sale: number;
    completed: number;
    total: number;
  }>(
    `SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'pending_confirm' THEN 1 END) as pending_confirm,
      COUNT(CASE WHEN status = 'pending_erp_fill' THEN 1 END) as pending_erp_fill,
      COUNT(CASE WHEN status = 'pending_warehouse_execute' THEN 1 END) as pending_warehouse_execute,
      COUNT(CASE WHEN status = 'pending_marketing_sale' THEN 1 END) as pending_marketing_sale,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
    FROM expiring_return_orders`
  );

  const row = result.rows[0];
  return {
    pendingConfirm: parseInt(row?.pending_confirm as any) || 0,
    pendingErpFill: parseInt(row?.pending_erp_fill as any) || 0,
    pendingWarehouseExecute: parseInt(row?.pending_warehouse_execute as any) || 0,
    pendingMarketingSale: parseInt(row?.pending_marketing_sale as any) || 0,
    completed: parseInt(row?.completed as any) || 0,
    total: parseInt(row?.total as any) || 0,
  };
}

/**
 * 获取待填写ERP退货单的列表
 */
export async function getPendingErpOrders(): Promise<ReturnOrder[]> {
  const result = await appQuery<{
    id: number;
    return_no: string;
    goods_id: string;
    goods_name: string;
    quantity: number;
    unit: string | null;
    batch_date: Date | null;
    return_date: Date | null;
    expire_date: Date | null;
    shelf_life: number | null;
    days_to_expire: number | null;
    days_to_expire_at_return: number | null;
    status: ReturnOrderStatus;
    source_bill_no: string | null;
    consumer_name: string | null;
    marketing_manager: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT 
      id, return_no, goods_id, goods_name, quantity, unit,
      batch_date, return_date, expire_date, shelf_life, days_to_expire, days_to_expire_at_return,
      status, source_bill_no, consumer_name, marketing_manager, created_at, updated_at
    FROM expiring_return_orders
    WHERE status = 'pending_erp_fill'
    ORDER BY created_at ASC`
  );

  return result.rows.map(row => ({
    id: row.id,
    returnNo: row.return_no,
    goodsId: row.goods_id,
    goodsName: row.goods_name,
    quantity: parseFloat(row.quantity as any) || 0,
    unit: row.unit,
    batchDate: row.batch_date,
    returnDate: row.return_date,
    expireDate: row.expire_date,
    shelfLife: row.shelf_life,
    daysToExpire: row.days_to_expire,
    daysToExpireAtReturn: row.days_to_expire_at_return,
    status: row.status,
    sourceBillNo: row.source_bill_no,
    consumerName: row.consumer_name,
    marketingManager: row.marketing_manager,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    erpReturnNo: null,
    erpFilledBy: null,
    erpFilledAt: null,
    warehouseExecutedBy: null,
    warehouseExecutedAt: null,
    warehouseReturnQuantity: null,
    warehouseEvidenceUrl: null,
    warehouseComment: null,
    marketingCompletedBy: null,
    marketingCompletedAt: null,
    marketingComment: null,
    ruleId: null,
    currentStock: null,
    purchasePrice: null,
    ruleConfirmedAt: null,
    ruleConfirmedBy: null,
  }));
}

/**
 * 获取退货单操作记录
 */
export async function getReturnOrderActions(orderId: number): Promise<ReturnAction[]> {
  const result = await appQuery<{
    id: number;
    order_id: number;
    action_type: string;
    operator_id: number | null;
    operator_name: string | null;
    action_at: Date;
    comment: string | null;
    details: any;
  }>(
    `SELECT * FROM expiring_return_actions
     WHERE order_id = $1
     ORDER BY action_at DESC`,
    [orderId]
  );

  return result.rows.map(row => ({
    id: row.id,
    orderId: row.order_id,
    actionType: row.action_type as ReturnAction['actionType'],
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    actionAt: row.action_at,
    comment: row.comment,
    details: row.details,
  }));
}
