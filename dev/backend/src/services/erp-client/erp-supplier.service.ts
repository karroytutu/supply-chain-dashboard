/**
 * ERP 供应商查询服务
 * 封装供应商列表搜索的 ERP API 调用，支持关键词搜索和缓存
 * @domain 采购 (Procurement)
 * @module services/erp-client/erp-supplier.service
 */
import { erpPost, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import type { ErpSupplier } from './erp-purchase.types';

/**
 * 查询供应商列表 (API#15)
 * POST /redcoast/supplier/search
 * 支持关键词搜索（queryText），缓存 5 分钟（LOW_FREQUENCY）
 */
export async function searchSuppliers(keyword?: string, page: number = 1, size: number = 50): Promise<ErpSupplier[]> {
  const cacheKey = CACHE_KEY.ERP_PURCHASE_SUPPLIERS(`${keyword || ''}:${page}:${size}`);
  const cached = cache.get<ErpSupplier[]>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const body: Record<string, unknown> = { current: page, size, state: 0, cid, uid };
  if (keyword) body.queryText = keyword;

  const result = await erpPost<unknown>(
    '/supplier/search',
    body,
    { pathPrefix: '/redcoast/', businessType: 'supplier_search' }
  );

  const data = extractErpData<{ records?: ErpSupplier[] }>(result);
  const suppliers = data?.records ?? [];
  cache.set(cacheKey, suppliers, CACHE_TTL.LOW_FREQUENCY);
  return suppliers;
}
