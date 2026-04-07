/**
 * 缺货和低库存预警服务
 */

import { query } from '../../db/pool';
import { convertStockUnits, parseUnitFactor, parseQuantity } from '../../utils/unitConverter';
import { LOW_STOCK_DAYS, STANDARD_CALC_DAYS } from '../../utils/constants';
import { getStrategicGoodsIds } from './warning-cache';
import type { WarningProduct, PaginatedResult, StrategicLevel } from './warning.types';

interface WarningParams {
  page: number;
  pageSize: number;
  strategicLevel?: StrategicLevel;
}

/**
 * 获取缺货商品
 */
export async function getOutOfStockProducts(
  params: WarningParams
): Promise<PaginatedResult<WarningProduct>> {
  const { page, pageSize, strategicLevel } = params;
  const offset = (page - 1) * pageSize;

  // 获取战略商品 ID 集合
  const strategicIds = await getStrategicGoodsIds();

  // 构建战略等级筛选条件（使用已获取的战略商品 ID 列表）
  let strategicFilter = '';
  if (strategicLevel === 'strategic') {
    if (strategicIds.size === 0) {
      // 没有战略商品，返回空结果
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
    const ids = Array.from(strategicIds).map(id => `'${id}'`).join(',');
    strategicFilter = `AND g."goodsId" IN (${ids})`;
  } else if (strategicLevel === 'normal') {
    if (strategicIds.size > 0) {
      const ids = Array.from(strategicIds).map(id => `'${id}'`).join(',');
      strategicFilter = `AND g."goodsId" NOT IN (${ids})`;
    }
  }

  const result = await query<{
    total_count: number;
    goods_id: string;
    goods_name: string;
    category_id: string;
    category_name: string;
    pkg_unit_name: string;
    unit_factor: number;
    avg_daily_sales: number;
  }>(`
    WITH daily_sales AS (
      SELECT "goodsName", SUM("baseQuantity") / ${STANDARD_CALC_DAYS}.0 as avg_daily
      FROM "销售结算明细表"
      WHERE "settleTime" >= NOW() - INTERVAL '${STANDARD_CALC_DAYS} days'
      GROUP BY "goodsName"
    ),
    stock_summary AS (
      SELECT "goodsId", SUM("availableBaseQuantity") as total_quantity
      FROM "实时库存表"
      GROUP BY "goodsId"
    )
    SELECT
      COUNT(*) OVER() as total_count,
      g."goodsId" as goods_id,
      g."name" as goods_name,
      g."categoryId" as category_id,
      SPLIT_PART(g."categoryChainName", '/', 1) as category_name,
      g."pkgUnitName" as pkg_unit_name,
      COALESCE(g."unitFactor", 1) as unit_factor,
      COALESCE(s.avg_daily, 0) as avg_daily_sales
    FROM "商品档案" g
    LEFT JOIN stock_summary r ON g."goodsId" = r."goodsId"
    LEFT JOIN daily_sales s ON g."name" = s."goodsName"
    WHERE g."state" = 0
      AND (r.total_quantity = 0 OR r.total_quantity IS NULL)
      ${strategicFilter}
    ORDER BY avg_daily_sales DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count as any) || 0 : 0;
  const totalPages = Math.ceil(total / pageSize);

  const data = result.rows.map(row => {
    const unitFactor = parseUnitFactor(row.unit_factor);
    const baseAvgDaily = parseQuantity(row.avg_daily_sales);

    return {
      productId: row.goods_id || '',
      productCode: row.goods_id || '',
      productName: row.goods_name || '',
      categoryId: row.category_id || '',
      categoryName: row.category_name || '未分类',
      brand: null,
      specification: null,
      stock: {
        quantity: 0,
        unitName: row.pkg_unit_name || '个',
        warehouseLocation: null,
      },
      turnover: {
        days: 0,
        avgDailySales: Math.round((baseAvgDaily / unitFactor) * 100) / 100,
      },
      expiring: {
        daysToExpiry: null,
        expiryDate: null,
      },
      availability: {
        status: 'out_of_stock' as const,
      },
      strategicLevel: strategicIds.has(row.goods_id) ? 'strategic' as const : 'normal' as const,
    };
  });

  return { data, total, page, pageSize, totalPages };
}

/**
 * 获取低库存商品
 */
export async function getLowStockProducts(
  params: WarningParams
): Promise<PaginatedResult<WarningProduct>> {
  const { page, pageSize, strategicLevel } = params;
  const offset = (page - 1) * pageSize;

  // 获取战略商品 ID 集合
  const strategicIds = await getStrategicGoodsIds();

  // 构建战略等级筛选条件（使用已获取的战略商品 ID 列表）
  let strategicFilter = '';
  if (strategicLevel === 'strategic') {
    if (strategicIds.size === 0) {
      // 没有战略商品，返回空结果
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
    const ids = Array.from(strategicIds).map(id => `'${id}'`).join(',');
    strategicFilter = `AND g."goodsId" IN (${ids})`;
  } else if (strategicLevel === 'normal') {
    if (strategicIds.size > 0) {
      const ids = Array.from(strategicIds).map(id => `'${id}'`).join(',');
      strategicFilter = `AND g."goodsId" NOT IN (${ids})`;
    }
  }

  const result = await query<{
    total_count: number;
    goods_id: string;
    goods_name: string;
    category_id: string;
    category_name: string;
    stock_quantity: number;
    pkg_unit_name: string;
    base_unit_name: string;
    unit_factor: number;
    avg_daily_sales: number;
    turnover_days: number;
  }>(`
    WITH daily_sales AS (
      SELECT "goodsName", SUM("baseQuantity") / ${STANDARD_CALC_DAYS}.0 as avg_daily
      FROM "销售结算明细表"
      WHERE "settleTime" >= NOW() - INTERVAL '${STANDARD_CALC_DAYS} days'
      GROUP BY "goodsName"
    ),
    stock_summary AS (
      SELECT "goodsId", "goodsName", SUM("availableBaseQuantity") as total_quantity
      FROM "实时库存表"
      GROUP BY "goodsId", "goodsName"
    )
    SELECT
      COUNT(*) OVER() as total_count,
      g."goodsId" as goods_id,
      g."name" as goods_name,
      g."categoryId" as category_id,
      SPLIT_PART(g."categoryChainName", '/', 1) as category_name,
      r.total_quantity as stock_quantity,
      g."pkgUnitName" as pkg_unit_name,
      g."baseUnitName" as base_unit_name,
      COALESCE(g."unitFactor", 1) as unit_factor,
      COALESCE(s.avg_daily, 0) as avg_daily_sales,
      CASE
        WHEN COALESCE(s.avg_daily, 0) > 0
        THEN r.total_quantity / s.avg_daily
        ELSE 999
      END as turnover_days
    FROM "商品档案" g
    JOIN stock_summary r ON g."goodsId" = r."goodsId"
    LEFT JOIN daily_sales s ON r."goodsName" = s."goodsName"
    WHERE g."state" = 0
      AND r.total_quantity > 0
      AND s.avg_daily IS NOT NULL
      AND s.avg_daily > 0
      AND r.total_quantity / s.avg_daily <= ${LOW_STOCK_DAYS}
      ${strategicFilter}
    ORDER BY turnover_days ASC, avg_daily_sales DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count as any) || 0 : 0;
  const totalPages = Math.ceil(total / pageSize);

  const data = result.rows.map(row => {
    const unitFactor = parseUnitFactor(row.unit_factor);
    const baseQuantity = parseQuantity(row.stock_quantity);
    const baseAvgDaily = parseQuantity(row.avg_daily_sales);

    const converted = convertStockUnits({
      baseQuantity,
      baseAvgDaily,
      unitFactor,
      baseUnitName: row.base_unit_name || '个',
      pkgUnitName: row.pkg_unit_name || '个',
    });

    return {
      productId: row.goods_id || '',
      productCode: row.goods_id || '',
      productName: row.goods_name || '',
      categoryId: row.category_id || '',
      categoryName: row.category_name || '未分类',
      brand: null,
      specification: null,
      stock: {
        quantity: converted.displayQuantity,
        unitName: converted.displayUnit,
        warehouseLocation: null,
      },
      turnover: {
        days: Math.round(parseQuantity(row.turnover_days)),
        avgDailySales: Math.round(converted.displayAvgDaily * 100) / 100,
      },
      expiring: {
        daysToExpiry: null,
        expiryDate: null,
      },
      availability: {
        status: 'low_stock' as const,
      },
      strategicLevel: strategicIds.has(row.goods_id) ? 'strategic' as const : 'normal' as const,
    };
  });

  return { data, total, page, pageSize, totalPages };
}
