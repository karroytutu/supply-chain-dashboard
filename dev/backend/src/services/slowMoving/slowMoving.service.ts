/**
 * 滞销商品服务模块
 * 使用销售结算明细表和实时库存表计算
 * 滞销定义：超过7天未销售为轻度滞销，超过15天为中度滞销，超过30天为严重滞销
 */

import { query } from '../../db/pool';
import {
  SLOW_MOVING_MILD_DAYS,
  SLOW_MOVING_MODERATE_DAYS,
  SLOW_MOVING_SERIOUS_DAYS,
} from '../../utils/constants';
import type {
  SlowMovingData,
  SlowMovingDistribution,
  SlowMovingWarningStats,
  WarningProduct,
  PaginationParams,
  PaginatedResult,
} from './slowMoving.types';

/**
 * 获取滞销商品占比数据
 */
export async function getSlowMovingData(): Promise<SlowMovingData> {
  const slowMovingResult = await query<{
    total_cost: number;
    slow_moving_cost: number;
    cost_7_15: number;
    cost_15_30: number;
    cost_over_30: number;
    count_7_15: number;
    count_15_30: number;
    count_over_30: number;
  }>(`
    WITH last_sale AS (
      SELECT
        "goodsName",
        MAX("settleTime") as last_sale_time
      FROM "销售结算明细表"
      GROUP BY "goodsName"
    ),
    stock_with_sale AS (
      SELECT
        r."goodsName",
        r."availableCostAmount",
        r."availableBaseQuantity",
        s.last_sale_time,
        CASE
          WHEN s.last_sale_time IS NULL THEN 999
          ELSE EXTRACT(DAY FROM NOW() - s.last_sale_time)
        END as days_without_sale
      FROM "实时库存表" r
      LEFT JOIN last_sale s ON r."goodsName" = s."goodsName"
      WHERE r."availableBaseQuantity" > 0
    )
    SELECT 
      SUM("availableCostAmount") as total_cost,
      SUM(CASE WHEN days_without_sale > ${SLOW_MOVING_MILD_DAYS} THEN "availableCostAmount" END) as slow_moving_cost,
      SUM(CASE WHEN days_without_sale > ${SLOW_MOVING_MILD_DAYS} AND days_without_sale <= ${SLOW_MOVING_MODERATE_DAYS} THEN "availableCostAmount" END) as cost_7_15,
      SUM(CASE WHEN days_without_sale > ${SLOW_MOVING_MODERATE_DAYS} AND days_without_sale <= ${SLOW_MOVING_SERIOUS_DAYS} THEN "availableCostAmount" END) as cost_15_30,
      SUM(CASE WHEN days_without_sale > ${SLOW_MOVING_SERIOUS_DAYS} THEN "availableCostAmount" END) as cost_over_30,
      COUNT(CASE WHEN days_without_sale > ${SLOW_MOVING_MILD_DAYS} AND days_without_sale <= ${SLOW_MOVING_MODERATE_DAYS} THEN 1 END) as count_7_15,
      COUNT(CASE WHEN days_without_sale > ${SLOW_MOVING_MODERATE_DAYS} AND days_without_sale <= ${SLOW_MOVING_SERIOUS_DAYS} THEN 1 END) as count_15_30,
      COUNT(CASE WHEN days_without_sale > ${SLOW_MOVING_SERIOUS_DAYS} THEN 1 END) as count_over_30
    FROM stock_with_sale
  `);

  const data = slowMovingResult.rows[0];
  const totalCost = parseFloat(data.total_cost as any) || 0;
  const slowMovingCost = parseFloat(data.slow_moving_cost as any) || 0;
  const cost7_15 = parseFloat(data.cost_7_15 as any) || 0;
  const cost15_30 = parseFloat(data.cost_15_30 as any) || 0;
  const costOver30 = parseFloat(data.cost_over_30 as any) || 0;
  const count7_15 = parseInt(data.count_7_15 as any) || 0;
  const count15_30 = parseInt(data.count_15_30 as any) || 0;
  const countOver30 = parseInt(data.count_over_30 as any) || 0;

  const slowMovingRate = totalCost > 0 ? Math.round((slowMovingCost / totalCost) * 1000) / 10 : 0;

  // 滞销分布
  const distribution: SlowMovingDistribution[] = [
    {
      range: '7-15天',
      label: '轻度滞销',
      count: Math.round(cost7_15),
      percentage: slowMovingCost > 0 ? Math.round((cost7_15 / slowMovingCost) * 100) : 0,
    },
    {
      range: '15-30天',
      label: '中度滞销',
      count: Math.round(cost15_30),
      percentage: slowMovingCost > 0 ? Math.round((cost15_30 / slowMovingCost) * 100) : 0,
    },
    {
      range: '>30天',
      label: '严重滞销',
      count: Math.round(costOver30),
      percentage: slowMovingCost > 0 ? Math.round((costOver30 / slowMovingCost) * 100) : 0,
    },
  ];

  return {
    value: slowMovingRate,
    unit: 'percent',
    trend: -1.2,
    trendDirection: 'down',
    distribution,
    categories: [],
    slowMovingCost: Math.round(slowMovingCost),
    totalCost: Math.round(totalCost),
    warningStats: {
      mildSlowMoving: count7_15,
      moderateSlowMoving: count15_30,
      seriousSlowMoving: countOver30,
    },
  };
}

/**
 * 获取滞销商品列表
 */
export async function getSlowMovingProducts(
  minDays: number,
  maxDays: number | null,
  page: number,
  pageSize: number
): Promise<PaginatedResult<WarningProduct>> {
  const maxCondition = maxDays ? `AND days_without_sale <= ${maxDays}` : '';
  const offset = (page - 1) * pageSize;

  const result = await query<{
    total_count: number;
    goods_id: string;
    goods_name: string;
    category_id: string;
    category_name: string;
    stock_quantity: number;
    days_without_sale: number;
    last_sale_date: string | null;
  }>(`
    WITH last_sale AS (
      SELECT
        "goodsName",
        MAX("settleTime") as last_sale_time
      FROM "销售结算明细表"
      GROUP BY "goodsName"
    ),
    stock_summary AS (
      SELECT
        "goodsId",
        "goodsName",
        SUM("availableBaseQuantity") as total_quantity
      FROM "实时库存表"
      GROUP BY "goodsId", "goodsName"
      HAVING SUM("availableBaseQuantity") > 0
    ),
    stock_with_sale AS (
      SELECT
        r."goodsId",
        r."goodsName",
        r.total_quantity,
        s.last_sale_time,
        CASE
          WHEN s.last_sale_time IS NULL THEN 999
          ELSE EXTRACT(DAY FROM NOW() - s.last_sale_time)
        END as days_without_sale
      FROM stock_summary r
      LEFT JOIN last_sale s ON r."goodsName" = s."goodsName"
    )
    SELECT
      COUNT(*) OVER() as total_count,
      g."goodsId" as goods_id,
      g."name" as goods_name,
      g."categoryId" as category_id,
      SPLIT_PART(g."categoryChainName", '/', 1) as category_name,
      t.total_quantity as stock_quantity,
      t.days_without_sale,
      t.last_sale_time as last_sale_date
    FROM stock_with_sale t
    JOIN "商品档案" g ON t."goodsName" = g."name"
    WHERE g."state" = 0
      AND t.days_without_sale > ${minDays}
      ${maxCondition}
    ORDER BY t.days_without_sale DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count as any) || 0 : 0;
  const totalPages = Math.ceil(total / pageSize);

  const data = result.rows.map(row => ({
    productId: row.goods_id || '',
    productCode: row.goods_id || '',
    productName: row.goods_name || '',
    categoryId: row.category_id || '',
    categoryName: row.category_name || '未分类',
    brand: null,
    specification: null,
    stock: {
      quantity: parseInt(row.stock_quantity as any) || 0,
      warehouseLocation: null,
    },
    turnover: {
      days: 0,
      avgDailySales: 0,
    },
    expiring: {
      daysToExpiry: null,
      expiryDate: null,
    },
    availability: {
      status: 'available' as const,
    },
    slowMoving: {
      daysWithoutSale: parseInt(row.days_without_sale as any) || 0,
      lastSaleDate: row.last_sale_date ? new Date(row.last_sale_date).toISOString().split('T')[0] : null,
    },
  }));

  return { data, total, page, pageSize, totalPages };
}
