/**
 * 临期预警服务
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
 * 获取临期商品
 */
export async function getExpiringProducts(
  minDays: number,
  maxDays: number,
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
    batch_base_quantity: number;
    batch_cost_amount: number;
    pkg_unit_name: string;
    base_unit_name: string;
    unit_factor: number;
    days_to_expire: number;
    expiry_date: string | null;
  }>(`
    WITH batch_base AS (
      SELECT
        b."goodsName",
        b."quantity",
        b."unitName",
        b."daysToExpire",
        b."expireDate"
      FROM "独山云仓批次库存表" b
      WHERE b."daysToExpire" > ${minDays}
        AND b."daysToExpire" <= ${maxDays}
    ),
    goods_with_cost AS (
      SELECT 
        g."name",
        g."goodsId",
        g."categoryId",
        g."categoryChainName",
        g."baseUnitName",
        g."pkgUnitName",
        g."unitFactor",
        g."state",
        COALESCE(SUM(r."baseCostPrice" * r."availableBaseQuantity") / NULLIF(SUM(r."availableBaseQuantity"), 0), 0) as avg_cost_price
      FROM "商品档案" g
      LEFT JOIN "实时库存表" r ON g."name" = r."goodsName"
      GROUP BY g."name", g."goodsId", g."categoryId", g."categoryChainName", g."baseUnitName", g."pkgUnitName", g."unitFactor", g."state"
    ),
    batch_with_cost AS (
      SELECT
        g."name",
        g."goodsId",
        g."categoryId",
        g."categoryChainName",
        g."baseUnitName",
        g."pkgUnitName",
        g."unitFactor",
        b."daysToExpire",
        b."expireDate",
        b."quantity",
        b."unitName",
        g.avg_cost_price,
        CASE 
          WHEN b."unitName" = g."baseUnitName" THEN b."quantity"
          WHEN b."unitName" = g."pkgUnitName" THEN b."quantity" * g."unitFactor"
          ELSE b."quantity"
        END as base_quantity
      FROM batch_base b
      JOIN goods_with_cost g ON b."goodsName" = g."name"
      WHERE g."state" = 0
    ),
    expiring_summary AS (
      SELECT
        "name",
        "goodsId",
        "categoryId",
        "categoryChainName",
        "baseUnitName",
        "pkgUnitName",
        "unitFactor",
        SUM(base_quantity) as batch_base_quantity,
        SUM(base_quantity * avg_cost_price) as batch_cost_amount,
        MIN("daysToExpire") as min_days_to_expire,
        MIN("expireDate") as nearest_expire_date
      FROM batch_with_cost
      GROUP BY "name", "goodsId", "categoryId", "categoryChainName", "baseUnitName", "pkgUnitName", "unitFactor"
    )
    SELECT
      COUNT(*) OVER() as total_count,
      s."goodsId" as goods_id,
      s."name" as goods_name,
      s."categoryId" as category_id,
      SPLIT_PART(s."categoryChainName", '/', 1) as category_name,
      s.batch_base_quantity,
      s.batch_cost_amount,
      s."pkgUnitName" as pkg_unit_name,
      s."baseUnitName" as base_unit_name,
      COALESCE(s."unitFactor", 1) as unit_factor,
      s.min_days_to_expire as days_to_expire,
      s.nearest_expire_date as expiry_date
    FROM expiring_summary s
    JOIN "商品档案" g ON s."goodsId" = g."goodsId"
    WHERE g."state" = 0
      ${strategicFilter}
    ORDER BY s.min_days_to_expire ASC
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count as any) || 0 : 0;
  const totalPages = Math.ceil(total / pageSize);

  const data = result.rows.map(row => {
    const unitFactor = parseUnitFactor(row.unit_factor);
    const baseQuantity = parseQuantity(row.batch_base_quantity);

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
        costAmount: Math.round(parseQuantity(row.batch_cost_amount)),
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
      strategicLevel: strategicIds.has(row.goods_id) ? 'strategic' as const : 'normal' as const,
    };
  });

  return { data, total, page, pageSize, totalPages };
}
