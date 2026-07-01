/**
 * ERP 商品档案服务
 * 通过舟谱 API 拉取商品数据，替代直连 xinshutong 数据库
 * @module services/erp-client/erp-product.service
 */

import { erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { invalidateFacadeCache } from './erp-data-facade';
import { appQuery } from '../../db/appPool';
import { createLogger } from '../../utils/logger';

const log = createLogger('ErpProductService');

/** API 返回的商品记录 */
export interface ErpProduct {
  goodsId: number;
  id: number;
  name: string;
  categoryChainName: string;
  shelfLife: number;
  state: number;
  baseUnitName: string;
  pkgUnitName: string;
  unitFactor: number;
  midUnitName?: string | null;
  midUnitFactor?: number | null;
  brandName?: string;
  brandId?: number;
  specifications?: string;
  articleNumber?: string;
  warnDays?: number;
  /** 基本单位批发价 */
  baseWholesale?: number | null;
  /** 中单位批发价 */
  midWholesale?: number | null;
  /** 包装单位批发价 */
  pkgWholesale?: number | null;
}

/** API 分页响应 */
interface ApiProductResponse {
  code: number;
  data: {
    records: ErpProduct[];
    total: number;
    current: number;
    size: number;
  };
}

/** 默认 pageSize（实测 2000 最优） */
const DEFAULT_PAGE_SIZE = 2000;

/**
 * 从 ERP API 全量拉取商品档案
 *
 * @param state - 商品状态过滤，0=启用，空字符串=全部
 * @param skipCache - 为 true 时绕过缓存
 * @returns 商品记录数组
 */
/** in-flight 去重：多个并发调用共享同一 Promise，避免冷缓存时重复请求 ERP */
let _productsInFlight: Promise<ErpProduct[]> | null = null;

export async function fetchAllProducts(
  state: number | '' = 0,
  skipCache = false
): Promise<ErpProduct[]> {
  const cacheKey = CACHE_KEY.ERP_PRODUCTS_ALL;

  if (!skipCache) {
    const cached = cache.get<ErpProduct[]>(cacheKey);
    if (cached) return cached;
  }

  // in-flight 去重（仅对默认参数 state=0 生效）
  if (!skipCache && state === 0 && _productsInFlight) return _productsInFlight;

  const doFetch = async (): Promise<ErpProduct[]> => {
    const { cid, uid } = getErpDefaults();
    const allRecords: ErpProduct[] = [];
    let current = 1;

    while (true) {
      const result = await erpPost<ApiProductResponse>(
        '/spu-query/search',
        {
          state: state === '' ? '' : state,
          current,
          size: DEFAULT_PAGE_SIZE,
          total: 0,
          cid,
          uid,
        },
        {
          pathPrefix: '/redcoast/',
          businessType: 'product_fetch',
        }
      );

      const records = result?.data?.records || [];
      allRecords.push(...records);

      const total = result?.data?.total || 0;
      if (allRecords.length >= total || records.length < DEFAULT_PAGE_SIZE) {
        break;
      }
      current++;
    }

    // 仅在有数据时写入缓存，避免 ERP 暂时不可用时空结果被缓存
    if (allRecords.length > 0) {
      cache.set(cacheKey, allRecords, CACHE_TTL.ERP_SLOW);
    }

    return allRecords;
  };

  if (state === 0) {
    _productsInFlight = doFetch();
    try {
      return await _productsInFlight;
    } finally {
      _productsInFlight = null;
    }
  }
  return doFetch();
}

// [ERP本地化] 旧的模块级索引缓存已移除，由本地 PostgreSQL 表 + MemoryCache 接管
// 原 _productByNameMap / _productByIdMap 已删除

/**
 * 获取商品成本价 Map（延迟构建，多仓库取最高成本）
 * 使用统一 MemoryCache 管理，缓存键为 erp:product:costPriceMap
 */
async function getCostPriceMap(): Promise<Map<number, number>> {
  const cacheKey = CACHE_KEY.ERP_PRODUCT_COST_PRICE_MAP;
  const cached = cache.get<Map<number, number>>(cacheKey);
  if (cached) return cached;

  try {
    const { fetchAllInventory } = await import('./erp-inventory.service');
    const inventory = await fetchAllInventory();
    const costMap = new Map<number, number>();
    for (const inv of inventory) {
      const cost = parseFloat(inv.baseCostPrice) || 0;
      const existing = costMap.get(inv.goodsId) || 0;
      if (cost > existing) costMap.set(inv.goodsId, cost);
    }
    cache.set(cacheKey, costMap, CACHE_TTL.LOW_FREQUENCY);
    return costMap;
  } catch {
    // 库存 API 不可用时降级，成本价全部为 0
    const emptyMap = new Map<number, number>();
    cache.set(cacheKey, emptyMap, CACHE_TTL.LOW_FREQUENCY);
    return emptyMap;
  }
}

/**
 * 按商品名称查找
 * 优先从本地 erp_products 表查询，fallback 到内存缓存
 */
export async function getProductByName(name: string): Promise<ErpProduct | undefined> {
  // 优先从本地表查询
  try {
    const result = await appQuery<Record<string, unknown>>(
      `SELECT goods_id, name, category_chain_name, shelf_life, state,
              base_unit_name, pkg_unit_name, mid_unit_name, unit_factor, mid_unit_factor,
              brand_name, brand_id, specifications, article_number, warn_days,
              base_wholesale, mid_wholesale, pkg_wholesale
       FROM erp_products WHERE name = $1 LIMIT 1`,
      [name]
    );
    if (result.rows.length > 0) {
      return mapLocalRowToProduct(result.rows[0]);
    }
  } catch (err) {
    log.warn('本地表查询失败，fallback 到内存缓存:', err instanceof Error ? err.message : String(err));
  }

  // fallback
  const products = await fetchAllProducts();
  return products.find(p => p.name === name);
}

/**
 * 按商品 ID 查找
 * 优先从本地 erp_products 表查询，fallback 到内存缓存
 */
export async function getProductById(goodsId: number): Promise<ErpProduct | undefined> {
  // 优先从本地表查询
  try {
    const result = await appQuery<Record<string, unknown>>(
      `SELECT goods_id, name, category_chain_name, shelf_life, state,
              base_unit_name, pkg_unit_name, mid_unit_name, unit_factor, mid_unit_factor,
              brand_name, brand_id, specifications, article_number, warn_days,
              base_wholesale, mid_wholesale, pkg_wholesale
       FROM erp_products WHERE goods_id = $1 LIMIT 1`,
      [goodsId]
    );
    if (result.rows.length > 0) {
      return mapLocalRowToProduct(result.rows[0]);
    }
  } catch (err) {
    log.warn('本地表查询失败，fallback 到内存缓存:', err instanceof Error ? err.message : String(err));
  }

  // fallback
  const products = await fetchAllProducts();
  return products.find(p => p.goodsId === goodsId);
}

/** 本地表行 -> ErpProduct 映射 */
function mapLocalRowToProduct(row: Record<string, unknown>): ErpProduct {
  return {
    goodsId: row.goods_id as number,
    id: row.goods_id as number,
    name: row.name as string,
    categoryChainName: (row.category_chain_name as string) || '',
    shelfLife: (row.shelf_life as number) || 0,
    state: (row.state as number) || 0,
    baseUnitName: (row.base_unit_name as string) || '',
    pkgUnitName: (row.pkg_unit_name as string) || '',
    unitFactor: (row.unit_factor as number) || 1,
    midUnitName: (row.mid_unit_name as string) || null,
    midUnitFactor: (row.mid_unit_factor as number) || null,
    brandName: (row.brand_name as string) || undefined,
    brandId: (row.brand_id as number) || undefined,
    specifications: (row.specifications as string) || undefined,
    articleNumber: (row.article_number as string) || undefined,
    warnDays: (row.warn_days as number) || undefined,
    baseWholesale: row.base_wholesale != null ? Number(row.base_wholesale) : null,
    midWholesale: row.mid_wholesale != null ? Number(row.mid_wholesale) : null,
    pkgWholesale: row.pkg_wholesale != null ? Number(row.pkg_wholesale) : null,
  };
}

/**
 * 获取所有商品名称集合
 */
export async function getAllProductNames(): Promise<Set<string>> {
  const products = await fetchAllProducts();
  return new Set(products.map(p => p.name));
}

/**
 * 清除商品缓存（供缓存失效使用）
 */
export function invalidateProductCache(): void {
  cache.invalidate(CACHE_KEY.ERP_PRODUCTS_PREFIX);
  cache.invalidate(CACHE_KEY.ERP_PRODUCT_COST_PRICE_MAP);
  invalidateFacadeCache();
}

// =====================================================
// 促销表单商品搜索（含成本价、可用单位）
// =====================================================

/** 促销商品搜索结果 */
export interface PromotionGoodsItem {
  goodsId: number;
  name: string;
  /** 基本单位名称（如"瓶"、"包"） */
  baseUnitName: string;
  /** 包装单位名称（如"箱"、"件"） */
  pkgUnitName: string;
  /** 包装换算系数（1箱=24瓶） */
  unitFactor: number;
  /** 中单位名称（如"盒"、"组"），可能为空 */
  midUnitName?: string | null;
  /** 中单位换算系数（1盒=20包），可能为空 */
  midUnitFactor?: number | null;
  /** 可用单位列表（含换算系数） */
  units: Array<{ id: string; name: string; factor: number }>;
  /** 成本价（基本单位） */
  costPrice: number;
  /** 保质期天数 */
  shelfLife: number;
  /** 预警天数 */
  warnDays?: number;
  /** 品牌 */
  brandName?: string;
  /** 品牌ID */
  brandId?: number;
  /** 分类 */
  categoryChainName?: string;
  /** 基本单位批发价 */
  baseWholesale?: number | null;
  /** 中单位批发价 */
  midWholesale?: number | null;
  /** 包装单位批发价 */
  pkgWholesale?: number | null;
}

/**
 * 搜索促销表单可用的商品
 * 返回包含成本价和可用单位的商品列表，供商品选择使用
 *
 * @param keyword 搜索关键词（匹配商品名称）
 * @param limit 返回数量限制，默认50
 */
export async function searchPromotionGoods(
  keyword: string,
  limit = 50
): Promise<PromotionGoodsItem[]> {
  // 获取全量商品（缓存）
  const products = await fetchAllProducts();

  // 按关键词过滤
  const filtered = keyword
    ? products.filter(p =>
        p.name.toLowerCase().includes(keyword.toLowerCase()) ||
        (p.brandName?.toLowerCase().includes(keyword.toLowerCase()))
      )
    : products;

  // 获取库存成本价（使用延迟单例缓存）
  const costMap = await getCostPriceMap();

  // 构建结果
  const results: PromotionGoodsItem[] = filtered.slice(0, limit).map(p => {
    // 构建三级可用单位列表（小/中/大），每个 unit 带 factor 换算系数
    const units: Array<{ id: string; name: string; factor: number }> = [];
    if (p.baseUnitName) {
      units.push({ id: 'BASE', name: p.baseUnitName, factor: 1 });
    }
    if (p.midUnitName && p.midUnitName !== p.baseUnitName && p.midUnitFactor && p.midUnitFactor > 1) {
      units.push({ id: 'MID', name: p.midUnitName, factor: p.midUnitFactor });
    }
    if (p.pkgUnitName && p.pkgUnitName !== p.baseUnitName) {
      units.push({ id: 'PKG', name: p.pkgUnitName, factor: p.unitFactor });
    }

    return {
      goodsId: p.goodsId,
      name: p.name,
      baseUnitName: p.baseUnitName,
      pkgUnitName: p.pkgUnitName,
      unitFactor: p.unitFactor,
      midUnitName: p.midUnitName,
      midUnitFactor: p.midUnitFactor,
      units,
      costPrice: costMap?.get(p.goodsId) || 0,
      shelfLife: p.shelfLife,
      warnDays: p.warnDays,
      brandName: p.brandName,
      brandId: p.brandId,
      categoryChainName: p.categoryChainName,
      baseWholesale: p.baseWholesale ?? null,
      midWholesale: p.midWholesale ?? null,
      pkgWholesale: p.pkgWholesale ?? null,
    };
  });

  return results;
}
