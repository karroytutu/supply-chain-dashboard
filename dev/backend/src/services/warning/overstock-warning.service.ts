/**
 * 库存积压预警服务
 */

import { query } from '../../db/pool';
import { convertStockUnits, parseUnitFactor, parseQuantity } from '../../utils/unitConverter';
import { OVERSTOCK_MILD_DAYS, OVERSTOCK_MODERATE_DAYS, OVERSTOCK_SERIOUS_DAYS, STANDARD_CALC_DAYS } from '../../utils/constants';
import { getStrategicGoodsIds } from './warning-cache';
import type { WarningProduct, PaginatedResult, StrategicLevel } from './warning.types';

interface WarningParams {
  page: number;
  pageSize: number;
  strategicLevel?: StrategicLevel;
}

/**
 * 获取库存积压商品
 */
export async function getOverstockProducts(
  minDays: number,
  maxDays: number | null,
  params: WarningParams
): Promise<PaginatedResult<WarningProduct>> {
  const { page, pageSize, strategicLevel } = params;
  const maxCondition = maxDays ? `AND r.total_quantity / s.avg_daily <= ${maxDays}` : '';
  const offset = (page - 1) * pageSize;

  // 获取战略商品 ID 集合
  const strategicIds = await getStrategicGoodsIds();

  // 构建战略等级筛选条件（使用已获取的战略商品 ID 列表）
  let strategicFilter = '';
  if (strategicLevel === 'strategic') {
    if (strategicIds.size === 0) {
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
    stock_cost_amount: number;
    pkg_unit_name: string;
    base_unit_name: string;
    unit_factor: number;
    avg_daily_sales: number;
    sellable_days: number;
  }>(`
    WITH daily_sales AS (
      SELECT "goodsName", SUM("baseQuantity") / ${STANDARD_CALC_DAYS}.0 as avg_daily
      FROM "销售结算明细表"
      WHERE "settleTime" >= NOW() - INTERVAL '${STANDARD_CALC_DAYS} days'
      GROUP BY "goodsName"
    ),
    stock_summary AS (
      SELECT "goodsId", "goodsName", SUM("availableBaseQuantity") as total_quantity, SUM("availableCostAmount") as total_cost
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
      COALESCE(r.total_cost, 0) as stock_cost_amount,
      g."pkgUnitName" as pkg_unit_name,
      g."baseUnitName" as base_unit_name,
      COALESCE(g."unitFactor", 1) as unit_factor,
      s.avg_daily as avg_daily_sales,
      r.total_quantity / s.avg_daily as sellable_days
    FROM stock_summary r
    JOIN "商品档案" g ON r."goodsId" = g."goodsId"
    LEFT JOIN daily_sales s ON r."goodsName" = s."goodsName"
    WHERE g."state" = 0
      AND r.total_quantity > 0
      AND s.avg_daily IS NOT NULL
      AND s.avg_daily > 0
      AND r.total_quantity / s.avg_daily > ${minDays}
      ${maxCondition}
      ${strategicFilter}
    ORDER BY sellable_days DESC
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
        costAmount: Math.round(parseQuantity(row.stock_cost_amount)),
        warehouseLocation: null,
      },
      turnover: {
        days: Math.round(parseQuantity(row.sellable_days)),
        avgDailySales: Math.round(converted.displayAvgDaily * 100) / 100,
      },
      expiring: {
        daysToExpiry: null,
        expiryDate: null,
      },
      availability: {
        status: 'available' as const,
      },
      strategicLevel: strategicIds.has(row.goods_id) ? 'strategic' as const : 'normal' as const,
    };
  });

  return { data, total, page, pageSize, totalPages };
}

// 导出常量供 index.ts 使用
export { OVERSTOCK_MILD_DAYS, OVERSTOCK_MODERATE_DAYS, OVERSTOCK_SERIOUS_DAYS };
