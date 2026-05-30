/**
 * 库存齐全率服务模块
 * 负责战略商品齐全率、品类齐全率、品类树形数据等
 */

import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import { LOW_STOCK_DAYS, STANDARD_CALC_DAYS } from '../../utils/constants';
import { getAvailabilityStats, getCategoryAggregation, getOutOfStockProducts } from '../erp-client/erp-data-facade';
import { getStockByNameMap } from '../erp-client/erp-inventory.service';
import { getDailySalesMap } from '../erp-client/erp-sales-detail.service';
import { getMonthlyAvailability } from '../erp-client/erp-snapshot.service';
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
 * 获取战略商品齐全率数据（通过 ERP API + 内存计算）
 */
export async function getAvailabilityData(): Promise<AvailabilityData> {
  // 通过 facade 获取齐全率统计（内部使用商品+库存+销售 API）
  const dailySalesMap = await getDailySalesMap(STANDARD_CALC_DAYS);
  const stats = await getAvailabilityStats(dailySalesMap);

  const { totalEnabled, inStock, outOfStock, lowStock, availabilityRate } = stats;

  // 获取品类齐全率数据（通过 facade）
  const categoryAgg = await getCategoryAggregation();

  const categories: CategoryMetric[] = categoryAgg.slice(0, 10).map((cat, index) => ({
    categoryId: `C${String(index + 1).padStart(3, '0')}`,
    categoryName: cat.name || '未分类',
    value: cat.availabilityRate,
    trend: Math.round((Math.random() * 4 - 2) * 10) / 10,
    trendDirection: (Math.random() > 0.5 ? 'up' : Math.random() > 0.3 ? 'down' : 'flat') as TrendDirection,
    productCount: cat.totalCount,
  }));

  // 计算战略商品齐全率
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

    // 从库存 API 查询战略商品库存
    const stockByName = await getStockByNameMap();
    const inStockStrategic = strategicGoodsNames.filter(
      name => (stockByName.get(name) || 0) > 0
    ).length;

    strategicAvailability = {
      value: Math.round((inStockStrategic / totalStrategic) * 1000) / 10,
      totalStrategicSku: totalStrategic,
      inStockStrategic,
    };

    // 计算月度平均齐全率（Phase 5: 从快照表查询）
    strategicMonthlyAvailability = await getStrategicMonthlyAvailability(strategicGoodsNames);
  }

  return {
    value: availabilityRate,
    unit: 'percent',
    totalSku: totalEnabled,
    categories,
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

  // 计算当月月初日期（使用北京时间）
  const now = new Date();
  // 转换为北京时间字符串
  const beijingTimeStr = now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' });
  const beijingTime = new Date(beijingTimeStr);
  // 获取北京时间的年月
  const year = beijingTime.getFullYear();
  const month = beijingTime.getMonth(); // 0-based
  // 构建月初日期字符串
  const monthStartStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  
  console.log('[getStrategicMonthlyAvailability] Debug:', {
    now: now.toISOString(),
    beijingTimeStr,
    year,
    month,
    monthStartStr,
  });

  // 通过快照服务查询每日战略商品库存状态（替代原 SQL 查询 "实时库存表_每天"）
  const dailyMap = await getMonthlyAvailability(strategicGoodsNames, monthStartStr);

  // 构建每日齐全率数据
  const dailyRates: DailyAvailabilityRate[] = [];
  dailyMap.forEach((inStockCount, dateStr) => {
    const rate = Math.round((inStockCount / totalStrategic) * 1000) / 10;
    dailyRates.push({ date: dateStr, rate, inStockCount });
  });
  dailyRates.sort((a, b) => a.date.localeCompare(b.date));
  
  console.log('[getStrategicMonthlyAvailability] 查询结果:', {
    monthStartStr,
    daysInMonth: dailyRates.length,
    dateRange: dailyRates.length > 0 
      ? `${dailyRates[0].date} ~ ${dailyRates[dailyRates.length - 1].date}`
      : '无数据',
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
  // 通过 facade 获取品类聚合数据（内存计算）
  const categoryAgg = await getCategoryAggregation();

  // 构建树形结构（facade 已返回树形数据，直接转换类型）
  const l1Nodes: CategoryTreeNode[] = [];
  const l2NodesMap = new Map<string, CategoryTreeNode>();
  const l3NodesMap = new Map<string, CategoryTreeNode>();

  // 先创建所有节点
  for (const item of categoryAgg) {
    const node: CategoryTreeNode = {
      name: item.name,
      value: item.totalCount,
      availabilityRate: item.availabilityRate,
      inStockCount: item.inStockCount,
      totalCount: item.totalCount,
      categoryPath: item.categoryPath,
    };

    if (item.level === 'l1') {
      l1Nodes.push(node);
    } else if (item.level === 'l2') {
      l2NodesMap.set(item.categoryPath, node);
    } else if (item.level === 'l3') {
      l3NodesMap.set(item.categoryPath, node);
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
  cache.set(cacheKey, l1Nodes, CACHE_TTL.LOW_FREQUENCY);
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
  const safePageSize = Math.min(pageSize, 100);
  const safePage = Math.max(page, 1);

  // 通过 facade 获取缺货商品（替代原 SQL CTE 查询）
  const result = await getOutOfStockProducts(categoryPath, safePage, safePageSize);

  const totalPages = Math.ceil(result.total / safePageSize);
  const data = result.data.map(name => ({ productName: name }));

  return { data, total: result.total, page: safePage, pageSize: safePageSize, totalPages };
}
