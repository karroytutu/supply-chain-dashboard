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
  brandName?: string;
  specifications?: string;
  articleNumber?: string;
  warnDays?: number;
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
export async function fetchAllProducts(
  state: number | '' = 0,
  skipCache = false
): Promise<ErpProduct[]> {
  const cacheKey = CACHE_KEY.ERP_PRODUCTS_ALL;

  if (!skipCache) {
    const cached = cache.get<ErpProduct[]>(cacheKey);
    if (cached) return cached;
  }

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

  // 写入缓存（TTL 60s）
  cache.set(cacheKey, allRecords, CACHE_TTL.DASHBOARD);

  return allRecords;
}

/**
 * 商品索引缓存（从 fetchAllProducts() 结果延迟构建）
 *
 * _productByNameMap: Map<name, ErpProduct> — 按商品名称 O(1) 查找
 * _productByIdMap:   Map<goodsId, ErpProduct> — 按商品 ID O(1) 查找
 *
 * 生命周期：
 * - 首次调用 getProductByName/getProductById 时延迟构建
 * - 在 invalidateProductCache() 被调用时清除
 * - 清除后下次 get 调用会重新从 MemoryCache 读取原始数据并构建索引
 */
let _productByNameMap: Map<string, ErpProduct> | null = null;
let _productByIdMap: Map<number, ErpProduct> | null = null;

/**
 * 按商品名称查找
 */
export async function getProductByName(name: string): Promise<ErpProduct | undefined> {
  if (!_productByNameMap) {
    const products = await fetchAllProducts();
    _productByNameMap = new Map(products.map(p => [p.name, p]));
  }
  return _productByNameMap.get(name);
}

/**
 * 按商品 ID 查找
 */
export async function getProductById(goodsId: number): Promise<ErpProduct | undefined> {
  if (!_productByIdMap) {
    const products = await fetchAllProducts();
    _productByIdMap = new Map(products.map(p => [p.goodsId, p]));
  }
  return _productByIdMap.get(goodsId);
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
  cache.invalidate('erp:products:');
  _productByNameMap = null;
  _productByIdMap = null;
  invalidateFacadeCache();
}
