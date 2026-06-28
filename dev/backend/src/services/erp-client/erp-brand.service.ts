/**
 * ERP 品牌列表服务
 * 通过舟谱 API 拉取品牌数据
 * @module services/erp-client/erp-brand.service
 */

import { erpPost, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { createLogger } from '../../utils/logger';

const log = createLogger('ErpBrand');

/** ERP 品牌对象 */
export interface ErpBrand {
  id: number;
  originBrandId: number;
  name: string;
  state: number;
  sort?: number;
}

/**
 * 全量拉取品牌列表（带缓存）
 * POST /redcoast/brand/search-without-permission
 */
export async function fetchAllBrands(): Promise<ErpBrand[]> {
  const cacheKey = CACHE_KEY.ERP_BRANDS;
  const cached = cache.get<ErpBrand[]>(cacheKey);
  if (cached) return cached;

  const { cid, uid } = getErpDefaults();
  const response = await erpPost<unknown>(
    '/brand/search-without-permission',
    { current: 1, size: 2000, state: 0, cid, uid },
    { pathPrefix: '/redcoast/', businessType: 'brand_list' }
  );

  const data = extractErpData<{ records?: ErpBrand[] }>(response);
  const brands = data?.records ?? [];

  cache.set(cacheKey, brands, CACHE_TTL.LOW_FREQUENCY);
  return brands;
}

/**
 * 将品牌内部主键 ID 转换为 ERP 业务 API 所需的 originBrandId
 * ERP 品牌搜索返回 { id, originBrandId, name }，其中 id 是数据库主键，
 * 但兑付协议、费用单等业务 API 要求传入 originBrandId
 */
export async function resolveBrandOriginId(brandId: number | string | null | undefined): Promise<number | null> {
  if (brandId == null || brandId === '' || brandId === 0) return null;
  const numId = Number(brandId);
  if (isNaN(numId)) return null;

  const brands = await fetchAllBrands();
  const found = brands.find(b => b.id === numId || b.originBrandId === numId);
  if (!found) {
    log.warn(`品牌ID ${numId} 在缓存中未找到，可能存在数据不一致`);
  }
  return found?.originBrandId ?? numId;
}
