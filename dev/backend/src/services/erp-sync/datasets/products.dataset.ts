/**
 * 商品档案数据集配置
 * Type A (snapshot): 每 2 分钟全量 UPSERT
 * 分页优化：使用 fetchAllPagesParallel 替代旧串行 while 循环
 * @module services/erp-sync/datasets/products
 */

import { erpPost } from '../../erp-client/erp-client';
import { getErpDefaults } from '../../erp-client/erp-config';
import { fetchAllPagesParallel } from '../../erp-client/erp-pagination';
import type { SyncSourceConfig } from '../sync-types';

const PAGE_SIZE = 2000;

export const productsConfig: SyncSourceConfig = {
  id: 'products',
  name: '商品档案',
  type: 'snapshot',
  fetchAll: async () => {
    const { cid, uid } = getErpDefaults();
    const fetchPage = async (current: number) => {
      const result = await erpPost<{ data?: { records?: unknown[]; total?: number } }>(
        '/spu-query/search',
        { state: 0, current, size: PAGE_SIZE, total: 0, cid, uid },
        { pathPrefix: '/redcoast/', businessType: 'product_fetch' }
      );
      return { records: result?.data?.records || [], total: result?.data?.total || 0 };
    };
    return fetchAllPagesParallel(fetchPage, PAGE_SIZE);
  },
  transform: (api: unknown) => {
    const r = api as Record<string, unknown>;
    return {
      goods_id: r.goodsId,
      name: r.name ?? null,
      short_name: r.shortName ?? null,
      category_id: r.categoryId ?? null,
      category_chain: r.categoryChain ?? null,
      category_chain_name: r.categoryChainName ?? null,
      brand_id: r.brandId ?? null,
      brand_name: r.brandName ?? null,
      state: r.state ?? null,
      base_unit_name: r.baseUnitName ?? null,
      pkg_unit_name: r.pkgUnitName ?? null,
      mid_unit_name: r.midUnitName ?? null,
      unit_factor: r.unitFactor ?? null,
      mid_unit_factor: r.midUnitFactor ?? null,
      shelf_life: r.shelfLife ?? null,
      shelf_life_type: r.shelfLifeType ?? null,
      warn_days: r.warnDays ?? null,
      specifications: r.specifications ?? null,
      article_number: r.articleNumber ?? null,
      base_wholesale: r.baseWholesale ?? null,
      mid_wholesale: r.midWholesale ?? null,
      pkg_wholesale: r.pkgWholesale ?? null,
      base_purchase: r.basePurchase ?? null,
      mid_purchase: r.midPurchase ?? null,
      pkg_purchase: r.pkgPurchase ?? null,
      base_cheapest: r.baseCheapest ?? null,
      mid_cheapest: r.midCheapest ?? null,
      pkg_cheapest: r.pkgCheapest ?? null,
      base_barcode: r.baseBarcode ?? null,
      pkg_barcode: r.pkgBarcode ?? null,
      mid_barcode: r.midBarcode ?? null,
      base_weight: r.baseWeight ?? null,
      base_volume: r.baseVolume ?? null,
      unit_factor_name: r.unitFactorName ?? null,
    };
  },
  targetTable: 'erp_products',
  primaryKey: ['goods_id'],
  intervalMs: 120000,
  pageSize: PAGE_SIZE,
  enableFallback: true,
};
