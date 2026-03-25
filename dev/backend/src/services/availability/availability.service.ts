/**
 * 库存齐全率服务模块
 * 负责战略商品齐全率、品类齐全率、品类树形数据等
 */

import { query } from '../../db/pool';
import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import { LOW_STOCK_DAYS, STANDARD_CALC_DAYS } from '../../utils/constants';
import type {
  AvailabilityData,
  CategoryMetric,
  CategoryTreeNode,
  StockWarningStats,
  StrategicAvailabilityData,
  StrategicMonthlyAvailabilityData,
  DailyAvailabilityRate,
  PaginationParams,
  PaginatedResult,
  TrendDirection,
} from './availability.types';

/**
 * 获取战略商品齐全率数据
 */
export async function getAvailabilityData(): Promise<AvailabilityData> {
  // 统计启用商品总数和有库存商品数
  const stockResult = await query<{
    total_enabled: number;
    in_stock: number;
    out_of_stock: number;
  }>(`
    WITH enabled_goods AS (
      SELECT "goodsId", "name"
      FROM "商品档案"
      WHERE "state" = 0
    )
    SELECT 
      COUNT(*) as total_enabled,
      COUNT(CASE WHEN r."availableBaseQuantity" > 0 THEN 1 END) as in_stock,
      COUNT(CASE WHEN r."availableBaseQuantity" = 0 OR r."availableBaseQuantity" IS NULL THEN 1 END) as out_of_stock
    FROM enabled_goods g
    LEFT JOIN "实时库存表" r ON g."goodsId" = r."goodsId"
  `);

  const stockData = stockResult.rows[0];
  const totalEnabled = parseInt(stockData.total_enabled as any);
  const inStock = parseInt(stockData.in_stock as any);
  const outOfStock = parseInt(stockData.out_of_stock as any);

  // 计算低库存商品数（可售天数 <= 15天）
  const lowStockResult = await query<{ low_stock: number }>(`
    WITH enabled_goods AS (
      SELECT g."goodsId", g."name"
      FROM "商品档案" g
      WHERE g."state" = 0
    ),
    daily_sales AS (
      SELECT "goodsName", SUM("baseQuantity") / ${STANDARD_CALC_DAYS}.0 as avg_daily
      FROM "销售结算明细表"
      WHERE "settleTime" >= NOW() - INTERVAL '${STANDARD_CALC_DAYS} days'
      GROUP BY "goodsName"
    )
    SELECT COUNT(*) as low_stock
    FROM enabled_goods g
    JOIN "实时库存表" r ON g."goodsId" = r."goodsId"
    LEFT JOIN daily_sales s ON r."goodsName" = s."goodsName"
    WHERE r."availableBaseQuantity" > 0 
      AND r."availableBaseQuantity" / NULLIF(s.avg_daily, 0) <= ${LOW_STOCK_DAYS}
  `);

  const lowStock = parseInt(lowStockResult.rows[0]?.low_stock as any) || 0;

  // 获取品类齐全率数据
  const categoryResult = await query<{
    category_name: string;
    total: number;
    in_stock_count: number;
  }>(`
    WITH enabled_goods AS (
      SELECT g."goodsId", g."name", 
        SPLIT_PART(g."categoryChainName", '/', 1) as category_name
      FROM "商品档案" g
      WHERE g."state" = 0 AND g."categoryChainName" IS NOT NULL
    )
    SELECT 
      category_name,
      COUNT(*) as total,
      COUNT(CASE WHEN r."availableBaseQuantity" > 0 THEN 1 END) as in_stock_count
    FROM enabled_goods g
    LEFT JOIN "实时库存表" r ON g."goodsId" = r."goodsId"
    GROUP BY category_name
    ORDER BY COUNT(CASE WHEN r."availableBaseQuantity" > 0 THEN 1 END)::float / COUNT(*) DESC
  `);

  const categories: CategoryMetric[] = categoryResult.rows.map((row, index) => {
    const total = parseInt(row.total as any);
    const inStockCount = parseInt(row.in_stock_count as any);
    const value = total > 0 ? Math.round((inStockCount / total) * 1000) / 10 : 0;
    
    return {
      categoryId: `C${String(index + 1).padStart(3, '0')}`,
      categoryName: row.category_name || '未分类',
      value,
      trend: Math.round((Math.random() * 4 - 2) * 10) / 10,
      trendDirection: Math.random() > 0.5 ? 'up' : Math.random() > 0.3 ? 'down' : 'flat',
      productCount: total,
    };
  });

  const availabilityRate = totalEnabled > 0 ? Math.round((inStock / totalEnabled) * 1000) / 10 : 0;

  // 计算战略商品齐全率（跨数据库查询）
  // 第一步：从 xly_dashboard 获取已确认的战略商品 goods_name 列表
  const strategicGoodsResult = await appQuery<{ goods_name: string }>(`
    SELECT goods_name
    FROM strategic_products
    WHERE status = 'confirmed' AND confirmed_at IS NOT NULL
  `);

  let strategicAvailability: StrategicAvailabilityData | undefined;
  let strategicMonthlyAvailability: StrategicMonthlyAvailabilityData | undefined;

  if (strategicGoodsResult.rows.length > 0) {
    const strategicGoodsNames = strategicGoodsResult.rows.map(r => r.goods_name);
    const totalStrategic = strategicGoodsNames.length;

    // 第二步：用商品名称去 xinshutong 查询库存
    const stockResult = await query<{ in_stock_count: number }>(`
      SELECT COUNT(DISTINCT "goodsName") as in_stock_count
      FROM "实时库存表"
      WHERE "goodsName" = ANY($1) AND "availableBaseQuantity" > 0
    `, [strategicGoodsNames]);

    const inStockStrategic = parseInt(stockResult.rows[0]?.in_stock_count as any) || 0;

    strategicAvailability = {
      value: Math.round((inStockStrategic / totalStrategic) * 1000) / 10,
      totalStrategicSku: totalStrategic,
      inStockStrategic,
    };

    // 计算月度平均齐全率
    strategicMonthlyAvailability = await getStrategicMonthlyAvailability(strategicGoodsNames);
  }

  return {
    value: availabilityRate,
    unit: 'percent',
    totalSku: totalEnabled,
    categories: categories.slice(0, 10),
    warningStats: {
      outOfStock,
      lowStock,
    },
    strategicAvailability,
    strategicMonthlyAvailability,
  };
}

/**
 * 获取战略商品月度平均齐全率
 * 通过每日库存快照计算月度平均值
 */
export async function getStrategicMonthlyAvailability(
  strategicGoodsNames: string[]
): Promise<StrategicMonthlyAvailabilityData | undefined> {
  if (strategicGoodsNames.length === 0) {
    return undefined;
  }

  const totalStrategic = strategicGoodsNames.length;

  // 计算当月月初日期
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartStr = monthStart.toISOString().split('T')[0];

  // 查询每日战略商品库存状态（使用商品名称匹配）
  const dailyStockResult = await query<{
    stock_date: Date;
    in_stock_count: number;
  }>(`
    SELECT
      "数据日期"::date as stock_date,
      COUNT(DISTINCT "goodsName") as in_stock_count
    FROM "实时库存表_每天"
    WHERE "goodsName" = ANY($1)
      AND "availableBaseQuantity" > 0
      AND "数据日期" >= $2
      AND "数据日期" <= CURRENT_DATE
    GROUP BY "数据日期"::date
    ORDER BY stock_date
  `, [strategicGoodsNames, monthStartStr]);

  // 构建每日齐全率数据
  const dailyRates: DailyAvailabilityRate[] = dailyStockResult.rows.map(row => {
    const inStockCount = parseInt(row.in_stock_count as any) || 0;
    const rate = Math.round((inStockCount / totalStrategic) * 1000) / 10;
    return {
      date: (row.stock_date as Date).toISOString().split('T')[0],
      rate,
      inStockCount,
    };
  });

  // 计算月度平均齐全率
  const daysInMonth = dailyRates.length;
  let avgRate = 0;

  if (daysInMonth > 0) {
    const totalRate = dailyRates.reduce((sum, d) => sum + d.rate, 0);
    avgRate = Math.round((totalRate / daysInMonth) * 10) / 10;
  }

  return {
    value: avgRate,
    totalStrategicSku: totalStrategic,
    daysInMonth,
    dailyRates,
  };
}

/**
 * 获取完整的嵌套品类齐全率数据（用于 Treemap 钻取）
 * 使用 SQL 层聚合优化性能，并使用缓存减少数据库查询
 */
export async function getCategoryTreeData(): Promise<CategoryTreeNode[]> {
  // 检查缓存
  const cacheKey = 'category:tree';
  const cached = cache.get<CategoryTreeNode[]>(cacheKey);
  if (cached) {
    console.log('[getCategoryTreeData] 使用缓存数据');
    return cached;
  }

  console.log('[getCategoryTreeData] 缓存未命中，查询数据库...');

  // 使用 SQL 层聚合，直接获取各级品类的统计数据
  // 避免在 Node.js 中遍历所有商品记录
  const result = await query<{
    level: string;
    name: string;
    parent_path: string | null;
    category_path: string;
    total_count: number;
    in_stock_count: number;
  }>(`
    WITH enabled_goods AS (
      SELECT
        g."goodsId",
        SPLIT_PART(g."categoryChainName", '/', 1) as l1,
        SPLIT_PART(g."categoryChainName", '/', 2) as l2,
        SPLIT_PART(g."categoryChainName", '/', 3) as l3
      FROM "商品档案" g
      WHERE g."state" = 0 AND g."categoryChainName" IS NOT NULL AND g."categoryChainName" != ''
    ),
    stock_summary AS (
      SELECT "goodsId", SUM("availableBaseQuantity") as total_quantity
      FROM "实时库存表"
      GROUP BY "goodsId"
    ),
    goods_with_stock AS (
      SELECT
        e."goodsId",
        e.l1,
        e.l2,
        e.l3,
        CASE WHEN s.total_quantity > 0 THEN true ELSE false END as has_stock
      FROM enabled_goods e
      LEFT JOIN stock_summary s ON e."goodsId" = s."goodsId"
    ),
    -- 一级品类统计
    l1_stats AS (
      SELECT
        l1 as name,
        l1 as category_path,
        NULL as parent_path,
        COUNT(*) as total_count,
        COUNT(CASE WHEN has_stock THEN 1 END) as in_stock_count
      FROM goods_with_stock
      WHERE l1 IS NOT NULL AND l1 != ''
      GROUP BY l1
    ),
    -- 二级品类统计
    l2_stats AS (
      SELECT
        l2 as name,
        l1 || '/' || l2 as category_path,
        l1 as parent_path,
        COUNT(*) as total_count,
        COUNT(CASE WHEN has_stock THEN 1 END) as in_stock_count
      FROM goods_with_stock
      WHERE l1 IS NOT NULL AND l1 != '' AND l2 IS NOT NULL AND l2 != ''
      GROUP BY l1, l2
    ),
    -- 三级品类统计
    l3_stats AS (
      SELECT
        l3 as name,
        l1 || '/' || l2 || '/' || l3 as category_path,
        l1 || '/' || l2 as parent_path,
        COUNT(*) as total_count,
        COUNT(CASE WHEN has_stock THEN 1 END) as in_stock_count
      FROM goods_with_stock
      WHERE l1 IS NOT NULL AND l1 != ''
        AND l2 IS NOT NULL AND l2 != ''
        AND l3 IS NOT NULL AND l3 != ''
      GROUP BY l1, l2, l3
    )
    SELECT 'l1' as level, name, parent_path, category_path, total_count, in_stock_count FROM l1_stats
    UNION ALL
    SELECT 'l2' as level, name, parent_path, category_path, total_count, in_stock_count FROM l2_stats
    UNION ALL
    SELECT 'l3' as level, name, parent_path, category_path, total_count, in_stock_count FROM l3_stats
    ORDER BY level, category_path
  `);

  // 构建树形结构
  const l1Nodes: CategoryTreeNode[] = [];
  const l2NodesMap = new Map<string, CategoryTreeNode>();
  const l3NodesMap = new Map<string, CategoryTreeNode>();

  for (const row of result.rows) {
    const total = parseInt(row.total_count as any);
    const inStock = parseInt(row.in_stock_count as any);
    const rate = total > 0 ? Math.round((inStock / total) * 1000) / 10 : 0;

    const node: CategoryTreeNode = {
      name: row.name,
      value: total,
      availabilityRate: rate,
      inStockCount: inStock,
      totalCount: total,
      categoryPath: row.category_path,
    };

    if (row.level === 'l1') {
      l1Nodes.push(node);
    } else if (row.level === 'l2') {
      l2NodesMap.set(row.category_path, node);
    } else if (row.level === 'l3') {
      l3NodesMap.set(row.category_path, node);
    }
  }

  // 组装树形结构：将三级节点挂到二级节点
  l3NodesMap.forEach((l3Node, l3Path) => {
    const parentPath = l3Path.substring(0, l3Path.lastIndexOf('/'));
    const l2Node = l2NodesMap.get(parentPath);
    if (l2Node) {
      if (!l2Node.children) l2Node.children = [];
      l2Node.children.push(l3Node);
    }
  });

  // 将二级节点挂到一级节点
  l2NodesMap.forEach((l2Node, l2Path) => {
    const l1Name = l2Path.substring(0, l2Path.indexOf('/'));
    const l1Node = l1Nodes.find(n => n.name === l1Name);
    if (l1Node) {
      if (!l1Node.children) l1Node.children = [];
      l1Node.children.push(l2Node);
    }
  });

  // 按齐全率升序排列（问题品类在前）
  l1Nodes.sort((a, b) => a.availabilityRate - b.availabilityRate);

  // 存入缓存
  cache.set(cacheKey, l1Nodes, CACHE_TTL.CATEGORY_STATS);
  console.log(`[getCategoryTreeData] 数据已缓存，共 ${l1Nodes.length} 个一级品类`);

  return l1Nodes;
}

/**
 * 获取指定品类下的缺货商品列表
 */
export async function getOutOfStockProductsByCategory(
  categoryPath: string,
  pagination: PaginationParams
): Promise<PaginatedResult<{ productName: string }>> {
  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const result = await query<{ product_name: string; total_count: number }>(`
    WITH enabled_goods AS (
      SELECT g."goodsId", g."name", g."categoryChainName"
      FROM "商品档案" g
      WHERE g."state" = 0 AND g."categoryChainName" LIKE $1 || '%'
    ),
    stock_summary AS (
      SELECT "goodsId", SUM("availableBaseQuantity") as total_quantity
      FROM "实时库存表"
      GROUP BY "goodsId"
    )
    SELECT 
      g."name" as product_name,
      COUNT(*) OVER() as total_count
    FROM enabled_goods g
    LEFT JOIN stock_summary s ON g."goodsId" = s."goodsId"
    WHERE s.total_quantity IS NULL OR s.total_quantity = 0
    ORDER BY g."name"
    LIMIT ${pageSize} OFFSET ${offset}
  `, [categoryPath]);

  const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count as any) || 0 : 0;
  const totalPages = Math.ceil(total / pageSize);

  const data = result.rows.map(row => ({
    productName: row.product_name || '',
  }));

  return { data, total, page, pageSize, totalPages };
}
