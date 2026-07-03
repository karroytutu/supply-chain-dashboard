/**
 * ERP 日均销售报表服务
 * 封装日均销售数据的查询 ERP API 调用，支持缓存和 in-flight 去重
 * @domain 销售 (Sales)
 * @module services/erp-client/erp-daily-sales.service
 */
import { createHash } from 'crypto';
import { erpPost, extractErpData } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { withInFlightDedup } from './erp-inflight';
import type { DailySalesGoodsRecord } from './erp-purchase.types';

/**
 * 获取日均销售数据 (API#13)
 * POST /toliman/goods/report/daily-sale
 * 支持 in-flight 去重 + 60s 缓存
 */
export async function getDailySalesData(
  goodsIds: number[]
): Promise<DailySalesGoodsRecord[]> {
  if (goodsIds.length === 0) return [];

  const sorted = [...goodsIds].sort((a, b) => a - b);
  const hash = createHash('md5').update(sorted.join(',')).digest('hex').slice(0, 12);
  const cacheKey = CACHE_KEY.ERP_PURCHASE_DAILY_SALE(hash);

  // 缓存检查
  const cached = cache.get<DailySalesGoodsRecord[]>(cacheKey);
  if (cached) return cached;

  // in-flight 去重 + 拉取
  return withInFlightDedup(`erp:daily-sales:${hash}`, async () => {
    const { cid, uid } = getErpDefaults();

    const result = await erpPost<unknown>(
      '/goods/report/daily-sale',
      { goodsIds: sorted, cid, uid },
      { pathPrefix: '/toliman/', businessType: 'daily_sales_report' }
    );

    const data = extractErpData<DailySalesGoodsRecord[]>(result) ?? [];
    cache.set(cacheKey, data, CACHE_TTL.DASHBOARD);
    return data;
  });
}
