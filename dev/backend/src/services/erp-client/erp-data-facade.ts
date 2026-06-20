/**
 * ERP 数据聚合层
 * 替代 SQL 中的 JOIN / GROUP BY / CTE 操作，在内存中完成
 * @module services/erp-client/erp-data-facade
 */

import { fetchAllProducts, type ErpProduct } from './erp-product.service';
import {
  fetchAllInventory,
  getStockSummaryMap,
  getStockByNameMap,
  getCostPriceByNameMap,
  type ErpInventoryRecord,
} from './erp-inventory.service';
import {
  groupBy,
  countBy,
  sumBy,
  getCategoryName,
  getCategoryLevel,
} from '../../utils/arrayAggregation';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';

// ============================================
// 商品 + 库存 JOIN
// ============================================

/** 带库存的商品记录 */
export interface ProductWithStock extends ErpProduct {
  totalStock: number;
  hasStock: boolean;
}

/**
 * 获取商品 + 库存 JOIN 结果（带缓存，TTL 30s）
 * 替代 SQL: 商品档案 LEFT JOIN 实时库存表 ON goodsId
 */
export async function getProductsWithStock(): Promise<ProductWithStock[]> {
  const cached = cache.get<ProductWithStock[]>(CACHE_KEY.ERP_FACADE_PRODUCTS_WITH_STOCK);
  if (cached) return cached;

  const [products, stockMap] = await Promise.all([fetchAllProducts(0), getStockSummaryMap()]);

  const result = products.map(p => {
    const totalStock = stockMap.get(p.goodsId) ?? 0;
    return { ...p, totalStock, hasStock: totalStock > 0 };
  });

  cache.set(CACHE_KEY.ERP_FACADE_PRODUCTS_WITH_STOCK, result, CACHE_TTL.HIGH_FREQUENCY);
  return result;
}

// ============================================
// 品类聚合
// ============================================

/** 品类聚合结果 */
export interface CategoryAggregation {
  name: string;
  categoryPath: string;
  totalCount: number;
  inStockCount: number;
  availabilityRate: number;
  level: 'l1' | 'l2' | 'l3';
  children?: CategoryAggregation[];
}

/**
 * 获取品类聚合数据（带缓存，TTL 60s）
 * 替代 SQL: SPLIT_PART(categoryChainName, '/', 1) + GROUP BY + COUNT
 */
export async function getCategoryAggregation(): Promise<CategoryAggregation[]> {
  const cached = cache.get<CategoryAggregation[]>(CACHE_KEY.ERP_FACADE_CATEGORY_AGG);
  if (cached) return cached;

  const productsWithStock = await getProductsWithStock();

  // 过滤有 categoryChainName 的商品
  const validProducts = productsWithStock.filter(
    p => p.categoryChainName && p.categoryChainName.trim() !== ''
  );

  // 按一级品类分组
  const l1Groups = groupBy(validProducts, p => getCategoryName(p.categoryChainName));

  const result: CategoryAggregation[] = [];

  l1Groups.forEach((products, l1Name) => {
    const totalCount = products.length;
    const inStockCount = countBy(products, p => p.hasStock);
    const availabilityRate =
      totalCount > 0 ? Math.round((inStockCount / totalCount) * 1000) / 10 : 0;

    const l1Node: CategoryAggregation = {
      name: l1Name,
      categoryPath: l1Name,
      totalCount,
      inStockCount,
      availabilityRate,
      level: 'l1',
    };

    // 二级品类
    const l2Groups = groupBy(products, p => {
      const l2Path = getCategoryLevel(p.categoryChainName, 1);
      return l2Path !== '未分类' && p.categoryChainName.split('/').length > 1 ? l2Path : '';
    });

    const l2Children: CategoryAggregation[] = [];
    l2Groups.forEach((l2Products, l2Path) => {
      if (!l2Path) return;
      const l2Total = l2Products.length;
      const l2InStock = countBy(l2Products, p => p.hasStock);

      const l2Node: CategoryAggregation = {
        name: l2Path.split('/').pop() || l2Path,
        categoryPath: l2Path,
        totalCount: l2Total,
        inStockCount: l2InStock,
        availabilityRate: l2Total > 0 ? Math.round((l2InStock / l2Total) * 1000) / 10 : 0,
        level: 'l2',
      };

      // 三级品类
      const l3Groups = groupBy(l2Products, p => {
        const l3Path = getCategoryLevel(p.categoryChainName, 2);
        return l3Path !== '未分类' && p.categoryChainName.split('/').length > 2 ? l3Path : '';
      });

      const l3Children: CategoryAggregation[] = [];
      l3Groups.forEach((l3Products, l3Path) => {
        if (!l3Path) return;
        const l3Total = l3Products.length;
        const l3InStock = countBy(l3Products, p => p.hasStock);
        l3Children.push({
          name: l3Path.split('/').pop() || l3Path,
          categoryPath: l3Path,
          totalCount: l3Total,
          inStockCount: l3InStock,
          availabilityRate: l3Total > 0 ? Math.round((l3InStock / l3Total) * 1000) / 10 : 0,
          level: 'l3',
        });
      });

      if (l3Children.length > 0) {
        l2Node.children = l3Children;
      }
      l2Children.push(l2Node);
    });

    if (l2Children.length > 0) {
      l1Node.children = l2Children;
    }
    result.push(l1Node);
  });

  // 按齐全率升序排列（问题品类在前）
  result.sort((a, b) => a.availabilityRate - b.availabilityRate);

  cache.set(CACHE_KEY.ERP_FACADE_CATEGORY_AGG, result, CACHE_TTL.DASHBOARD);
  return result;
}

/**
 * 清除聚合层缓存
 * 当商品或库存原始数据变更时，需同步清除此处的聚合结果缓存
 */
export function invalidateFacadeCache(): void {
  cache.invalidate(CACHE_KEY.ERP_FACADE_PREFIX);
}

// ============================================
// 齐全率统计
// ============================================

/** 齐全率统计结果 */
export interface AvailabilityStats {
  totalEnabled: number;
  inStock: number;
  outOfStock: number;
  lowStock: number;
  availabilityRate: number;
}

/**
 * 获取整体齐全率统计
 * 替代 SQL: WITH enabled_goods AS ... SELECT COUNT ...
 *
 * @param dailySalesMap - 日均销量 Map（用于低库存判定），可选
 */
export async function getAvailabilityStats(
  dailySalesMap?: Map<string, number>
): Promise<AvailabilityStats> {
  const productsWithStock = await getProductsWithStock();

  const totalEnabled = productsWithStock.length;
  const inStock = countBy(productsWithStock, p => p.hasStock);
  const outOfStock = totalEnabled - inStock;

  // 低库存：有库存但可售天数 <= 15 天
  let lowStock = 0;
  if (dailySalesMap) {
    const LOW_STOCK_DAYS = 15;
    lowStock = countBy(productsWithStock, p => {
      if (!p.hasStock) return false;
      const avgDaily = dailySalesMap.get(p.name) || 0;
      if (avgDaily <= 0) return false;
      return p.totalStock / avgDaily <= LOW_STOCK_DAYS;
    });
  }

  const availabilityRate = totalEnabled > 0 ? Math.round((inStock / totalEnabled) * 1000) / 10 : 0;

  return { totalEnabled, inStock, outOfStock, lowStock, availabilityRate };
}

// ============================================
// 缺货商品列表
// ============================================

/**
 * 获取指定品类下的缺货商品
 * 替代 SQL: WITH ... WHERE total_quantity IS NULL OR total_quantity = 0
 */
export async function getOutOfStockProducts(
  categoryPath: string,
  page = 1,
  pageSize = 20
): Promise<{ data: string[]; total: number }> {
  const productsWithStock = await getProductsWithStock();

  // 按品类过滤 + 缺货
  const outOfStock = productsWithStock.filter(
    p => p.categoryChainName.startsWith(categoryPath) && !p.hasStock
  );

  const total = outOfStock.length;
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 100);
  const start = (safePage - 1) * safePageSize;
  const data = outOfStock.slice(start, start + safePageSize).map(p => p.name);

  return { data, total };
}
