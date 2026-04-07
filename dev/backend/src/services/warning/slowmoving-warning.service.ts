/**
 * 滞销预警服务
 */

import { query } from '../../db/pool';
import { convertStockUnits, parseUnitFactor, parseQuantity } from '../../utils/unitConverter';
import { getStrategicGoodsIds } from './warning-cache';
import type { WarningProduct, PaginatedResult, StrategicLevel } from './warning.types';

interface WarningParams {
  page: number;
  pageSize: number;
  strategicLevel?: StrategicLevel;
}

/**
 * 获取滞销商品
 */
export async function getSlowMovingProducts(
  minDays: number,
  maxDays: number | null,
  params: WarningParams
): Promise<PaginatedResult<WarningProduct>> {
  const { page, pageSize, strategicLevel } = params;
  const maxCondition = maxDays ? `AND days_without_sale <= ${maxDays}` : '';
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
        SUM("availableBaseQuantity") as total_quantity,
        SUM("availableCostAmount") as total_cost_amount
      FROM "实时库存表"
      GROUP BY "goodsId", "goodsName"
      HAVING SUM("availableBaseQuantity") > 0
    ),
    stock_with_sale AS (
      SELECT
        r."goodsId",
        r."goodsName",
        r.total_quantity,
        r.total_cost_amount,
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
      t.total_cost_amount as stock_cost_amount,
      g."pkgUnitName" as pkg_unit_name,
      g."baseUnitName" as base_unit_name,
      COALESCE(g."unitFactor", 1) as unit_factor,
      t.days_without_sale,
      t.last_sale_time as last_sale_date
    FROM stock_with_sale t
    JOIN "商品档案" g ON t."goodsName" = g."name"
    WHERE g."state" = 0
      AND t.days_without_sale > ${minDays}
      ${maxCondition}
      ${strategicFilter}
    ORDER BY t.days_without_sale DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count as any) || 0 : 0;
  const totalPages = Math.ceil(total / pageSize);

  const data = result.rows.map(row => {
    const unitFactor = parseUnitFactor(row.unit_factor);
    const baseQuantity = parseQuantity(row.stock_quantity);

    const converted = convertStockUnits({
      baseQuantity,
      baseAvgDaily: 0,
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
      strategicLevel: strategicIds.has(row.goods_id) ? 'strategic' as const : 'normal' as const,
    };
  });

  return { data, total, page, pageSize, totalPages };
}
