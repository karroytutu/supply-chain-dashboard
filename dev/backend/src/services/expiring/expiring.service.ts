/**
 * 临期商品服务模块
 * 负责临期商品统计和查询
 */

import { query } from '../../db/pool';
import {
  EXPIRING_SERIOUS_DAYS,
  EXPIRING_WARNING_DAYS,
  EXPIRING_ATTENTION_DAYS,
  EXPIRING_RATE_SERIOUS,
  EXPIRING_RATE_WARNING,
  EXPIRING_RATE_ATTENTION,
  getExpiringThreshold,
  getExpiringWarningLevel,
} from '../../utils/constants';
import type {
  ExpiringData,
  ExpiringBreakdown,
  WarningProduct,
  PaginationParams,
  PaginatedResult,
  HealthStatus,
} from './expiring.types';

/**
 * 获取临期商品占比数据
 */
export async function getExpiringData(): Promise<ExpiringData> {
  const expiringResult = await query<{
    total_cost: number;
    expiring_cost: number;
    within_7_cost: number;
    within_15_cost: number;
    within_30_cost: number;
    within_7_count: number;
    within_15_count: number;
    within_30_count: number;
  }>(`
    WITH batch_with_cost AS (
      SELECT
        g."name",
        g."shelfLife",
        b."quantity",
        b."unitName",
        b."daysToExpire",
        b."qualityTypeStr",
        g."baseUnitName",
        g."pkgUnitName",
        g."midUnitName",
        g."unitFactor",
        g."midUnitFactor",
        r."baseCostPrice",
        CASE 
          WHEN g."shelfLife" <= 90 THEN 30
          WHEN g."shelfLife" BETWEEN 91 AND 150 THEN 45
          WHEN g."shelfLife" BETWEEN 151 AND 270 THEN 60
          WHEN g."shelfLife" >= 271 THEN 90
          ELSE 90
        END as expiring_threshold,
        CASE 
          WHEN b."unitName" = g."baseUnitName" THEN b."quantity"
          WHEN b."unitName" = g."pkgUnitName" THEN b."quantity" * g."unitFactor"
          WHEN b."unitName" = g."midUnitName" THEN b."quantity" * COALESCE(g."midUnitFactor", 1)
          ELSE b."quantity"
        END as base_quantity
      FROM "商品档案" g
      JOIN "独山云仓批次库存表" b ON g."name" = b."goodsName"
      LEFT JOIN "实时库存表" r ON g."name" = r."goodsName"
    ),
    expiring_goods AS (
      SELECT DISTINCT "name",
        CASE WHEN "daysToExpire" <= ${EXPIRING_SERIOUS_DAYS} THEN 1 END as is_within_7,
        CASE WHEN "daysToExpire" > ${EXPIRING_SERIOUS_DAYS} AND "daysToExpire" <= ${EXPIRING_WARNING_DAYS} THEN 1 END as is_within_15,
        CASE WHEN "daysToExpire" > ${EXPIRING_WARNING_DAYS} AND "daysToExpire" <= ${EXPIRING_ATTENTION_DAYS} THEN 1 END as is_within_30
      FROM batch_with_cost
      WHERE "daysToExpire" <= ${EXPIRING_ATTENTION_DAYS}
    )
    SELECT 
      (SELECT SUM(base_quantity * "baseCostPrice") FROM batch_with_cost) as total_cost,
      (SELECT SUM(base_quantity * "baseCostPrice") FROM batch_with_cost WHERE "daysToExpire" <= expiring_threshold) as expiring_cost,
      (SELECT SUM(base_quantity * "baseCostPrice") FROM batch_with_cost WHERE "daysToExpire" <= ${EXPIRING_SERIOUS_DAYS}) as within_7_cost,
      (SELECT SUM(base_quantity * "baseCostPrice") FROM batch_with_cost WHERE "daysToExpire" > ${EXPIRING_SERIOUS_DAYS} AND "daysToExpire" <= ${EXPIRING_WARNING_DAYS}) as within_15_cost,
      (SELECT SUM(base_quantity * "baseCostPrice") FROM batch_with_cost WHERE "daysToExpire" > ${EXPIRING_WARNING_DAYS} AND "daysToExpire" <= ${EXPIRING_ATTENTION_DAYS}) as within_30_cost,
      (SELECT COUNT(*) FROM expiring_goods WHERE is_within_7 = 1) as within_7_count,
      (SELECT COUNT(*) FROM expiring_goods WHERE is_within_15 = 1) as within_15_count,
      (SELECT COUNT(*) FROM expiring_goods WHERE is_within_30 = 1) as within_30_count
  `);

  const expiringData = expiringResult.rows[0];
  const totalCost = parseFloat(expiringData.total_cost as any) || 0;
  const expiringCost = parseFloat(expiringData.expiring_cost as any) || 0;
  const within7Cost = parseFloat(expiringData.within_7_cost as any) || 0;
  const within15Cost = parseFloat(expiringData.within_15_cost as any) || 0;
  const within30Cost = parseFloat(expiringData.within_30_cost as any) || 0;
  const within7Count = parseInt(expiringData.within_7_count as any) || 0;
  const within15Count = parseInt(expiringData.within_15_count as any) || 0;
  const within30Count = parseInt(expiringData.within_30_count as any) || 0;

  const expiringRate = totalCost > 0 ? Math.round((expiringCost / totalCost) * 1000) / 10 : 0;

  // 确定预警级别
  const warningLevel = getExpiringWarningLevel(expiringRate);

  // 确定健康状态
  let healthStatus: HealthStatus = 'excellent';
  if (expiringRate > EXPIRING_RATE_SERIOUS) healthStatus = 'warning';
  else if (expiringRate > EXPIRING_RATE_WARNING) healthStatus = 'attention';
  else if (expiringRate > EXPIRING_RATE_ATTENTION) healthStatus = 'good';

  // 临期分布
  const breakdown: ExpiringBreakdown[] = [
    {
      level: 'serious',
      label: '7天内',
      count: within7Count,
      percentage: totalCost > 0 ? Math.round((within7Cost / totalCost) * 1000) / 10 : 0,
      color: '#ff4d4f',
    },
    {
      level: 'warning',
      label: '15天内',
      count: within15Count,
      percentage: totalCost > 0 ? Math.round((within15Cost / totalCost) * 1000) / 10 : 0,
      color: '#faad14',
    },
    {
      level: 'attention',
      label: '30天内',
      count: within30Count,
      percentage: totalCost > 0 ? Math.round((within30Cost / totalCost) * 1000) / 10 : 0,
      color: '#fadb14',
    },
  ];

  return {
    value: expiringRate,
    unit: 'percent',
    trend: 0.5,
    trendDirection: 'up',
    healthStatus,
    warningLevel,
    breakdown,
    categories: [],
    within7Days: within7Count,
    within15Days: within15Count,
    within30Days: within30Count,
    expiringCost: Math.round(expiringCost),
    totalCost: Math.round(totalCost),
  };
}

/**
 * 获取临期商品列表
 */
export async function getExpiringProducts(
  minDays: number,
  maxDays: number,
  page: number,
  pageSize: number
): Promise<PaginatedResult<WarningProduct>> {
  const offset = (page - 1) * pageSize;

  const result = await query<{
    total_count: number;
    goods_id: string;
    goods_name: string;
    category_id: string;
    category_name: string;
    stock_quantity: number;
    days_to_expire: number;
    expiry_date: string | null;
  }>(`
    WITH expiring_batches AS (
      SELECT
        "goodsName",
        SUM("quantity") as expiring_quantity,
        MIN("daysToExpire") as min_days_to_expire,
        MIN("expireDate") as nearest_expire_date
      FROM "独山云仓批次库存表"
      WHERE "qualityTypeStr" = '良品'
        AND "daysToExpire" > ${minDays}
        AND "daysToExpire" <= ${maxDays}
      GROUP BY "goodsName"
    ),
    stock_summary AS (
      SELECT "goodsName", SUM("availableBaseQuantity") as total_quantity
      FROM "实时库存表"
      GROUP BY "goodsName"
    )
    SELECT
      COUNT(*) OVER() as total_count,
      g."goodsId" as goods_id,
      g."name" as goods_name,
      g."categoryId" as category_id,
      SPLIT_PART(g."categoryChainName", '/', 1) as category_name,
      COALESCE(s.total_quantity, b.expiring_quantity) as stock_quantity,
      b.min_days_to_expire as days_to_expire,
      b.nearest_expire_date as expiry_date
    FROM expiring_batches b
    JOIN "商品档案" g ON b."goodsName" = g."name"
    LEFT JOIN stock_summary s ON b."goodsName" = s."goodsName"
    WHERE g."state" = 0
    ORDER BY b.min_days_to_expire ASC
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
      daysToExpiry: parseInt(row.days_to_expire as any) || 0,
      expiryDate: row.expiry_date,
    },
    availability: {
      status: 'available' as const,
    },
  }));

  return { data, total, page, pageSize, totalPages };
}
