/**
 * 目标管理 - 商品目录服务
 * 负责 ERP 商品目录查询（按品类分组）
 */

import { cache, CACHE_TTL } from '../../utils/cache';
import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getStockSummaryMap } from '../erp-client/erp-inventory.service';
import { ERP_CACHE_PREFIX } from './cache-keys';
import type { ProductCatalogDTO } from './sales-target.types';

/**
 * 获取 ERP 商品目录（按品类分组）
 * 包含库存标记（has_stock），用于前端"有库存/无库存"筛选
 */
export async function getProductCatalog(): Promise<ProductCatalogDTO[]> {
  const cacheKey = `${ERP_CACHE_PREFIX}:product-catalog`;
  const cached = cache.get<ProductCatalogDTO[]>(cacheKey);
  if (cached) return cached;

  const [products, stockMap] = await Promise.all([
    fetchAllProducts(),
    getStockSummaryMap(),
  ]);

  const categoryMap = new Map<string, ProductCatalogDTO>();
  for (const p of products) {
    const catName = p.categoryChainName || '未分类';
    if (!categoryMap.has(catName)) {
      categoryMap.set(catName, { category_name: catName, products: [] });
    }
    const stockQty = stockMap.get(p.goodsId) || 0;
    categoryMap.get(catName)!.products.push({
      erp_goods_id: p.goodsId,
      goods_name: p.name,
      unit: p.pkgUnitName || p.baseUnitName,
      unit_price: p.pkgWholesale ?? p.baseWholesale ?? null,
      brand_name: p.brandName || null,
      has_stock: stockQty > 0,
    });
  }

  const result = Array.from(categoryMap.values()).sort((a, b) =>
    a.category_name.localeCompare(b.category_name)
  );

  cache.set(cacheKey, result, CACHE_TTL.LOW_FREQUENCY);
  return result;
}
