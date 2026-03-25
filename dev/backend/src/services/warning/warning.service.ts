/**
 * 预警商品服务模块
 * 统一处理各类预警商品的查询
 */

import { query } from '../../db/pool';
import { appQuery } from '../../db/appPool';
import { convertStockUnits, parseUnitFactor, parseQuantity } from '../../utils/unitConverter';
import {
  LOW_STOCK_DAYS,
  OVERSTOCK_MILD_DAYS,
  OVERSTOCK_MODERATE_DAYS,
  OVERSTOCK_SERIOUS_DAYS,
  STANDARD_CALC_DAYS,
} from '../../utils/constants';
import type {
  WarningProduct,
  PaginationParams,
  PaginatedResult,
} from './warning.types';

// 缓存战略商品 ID 集合
let strategicGoodsIdsCache: Set<string> | null = null;
let strategicGoodsIdsCacheTime = 0;
const STRATEGIC_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 获取已确认的战略商品 ID 集合
 */
async function getStrategicGoodsIds(): Promise<Set<string>> {
  const now = Date.now();
  if (strategicGoodsIdsCache && (now - strategicGoodsIdsCacheTime) < STRATEGIC_CACHE_TTL) {
    return strategicGoodsIdsCache;
  }

  try {
    const result = await appQuery<{ goods_id: string }>(`
      SELECT goods_id FROM strategic_products
      WHERE status = 'confirmed' AND confirmed_at IS NOT NULL
    `);
    strategicGoodsIdsCache = new Set(result.rows.map(r => r.goods_id));
    strategicGoodsIdsCacheTime = now;
    return strategicGoodsIdsCache;
  } catch (error) {
    console.error('获取战略商品列表失败:', error);
    return new Set();
  }
}

// 预警类型映射表
const WARNING_TYPE_HANDLERS: Record<string, (page: number, pageSize: number) => Promise<PaginatedResult<WarningProduct>>> = {
  'out_of_stock': getOutOfStockProducts,
  'low_stock': getLowStockProducts,
  'mild_overstock': (page, pageSize) => getOverstockProducts(OVERSTOCK_MILD_DAYS, OVERSTOCK_MODERATE_DAYS, page, pageSize),
  'moderate_overstock': (page, pageSize) => getOverstockProducts(OVERSTOCK_MODERATE_DAYS, OVERSTOCK_SERIOUS_DAYS, page, pageSize),
  'serious_overstock': (page, pageSize) => getOverstockProducts(OVERSTOCK_SERIOUS_DAYS, null, page, pageSize),
  'expiring_7': (page, pageSize) => getExpiringProducts(0, 7, page, pageSize),
  'expiring_15': (page, pageSize) => getExpiringProducts(7, 15, page, pageSize),
  'expiring_30': (page, pageSize) => getExpiringProducts(15, 30, page, pageSize),
  'mild_slow_moving': (page, pageSize) => getSlowMovingProducts(7, 15, page, pageSize),
  'moderate_slow_moving': (page, pageSize) => getSlowMovingProducts(15, 30, page, pageSize),
  'serious_slow_moving': (page, pageSize) => getSlowMovingProducts(30, null, page, pageSize),
};

/**
 * 获取预警商品列表（统一入口）
 */
export async function getWarningProducts(
  warningType: string,
  pagination?: PaginationParams
): Promise<PaginatedResult<WarningProduct>> {
  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? 20;

  const handler = WARNING_TYPE_HANDLERS[warningType];
  if (!handler) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  return handler(page, pageSize);
}

/**
 * 获取缺货商品
 */
async function getOutOfStockProducts(page: number, pageSize: number): Promise<PaginatedResult<WarningProduct>> {
  const offset = (page - 1) * pageSize;

  // 获取战略商品 ID 集合
  const strategicIds = await getStrategicGoodsIds();

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
async function getLowStockProducts(page: number, pageSize: number): Promise<PaginatedResult<WarningProduct>> {
  const offset = (page - 1) * pageSize;

  // 获取战略商品 ID 集合
  const strategicIds = await getStrategicGoodsIds();

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

/**
 * 获取库存积压商品
 */
async function getOverstockProducts(
  minDays: number,
  maxDays: number | null,
  page: number,
  pageSize: number
): Promise<PaginatedResult<WarningProduct>> {
  const maxCondition = maxDays ? `AND r.total_quantity / s.avg_daily <= ${maxDays}` : '';
  const offset = (page - 1) * pageSize;

  // 获取战略商品 ID 集合
  const strategicIds = await getStrategicGoodsIds();

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

/**
 * 获取临期商品
 */
async function getExpiringProducts(
  minDays: number,
  maxDays: number,
  page: number,
  pageSize: number
): Promise<PaginatedResult<WarningProduct>> {
  const offset = (page - 1) * pageSize;

  // 获取战略商品 ID 集合
  const strategicIds = await getStrategicGoodsIds();

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

/**
 * 获取滞销商品
 */
async function getSlowMovingProducts(
  minDays: number,
  maxDays: number | null,
  page: number,
  pageSize: number
): Promise<PaginatedResult<WarningProduct>> {
  const maxCondition = maxDays ? `AND days_without_sale <= ${maxDays}` : '';
  const offset = (page - 1) * pageSize;

  // 获取战略商品 ID 集合
  const strategicIds = await getStrategicGoodsIds();

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
