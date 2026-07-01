/**
 * 实时库存数据集配置
 * Type A (snapshot): 每 2 分钟全量 UPSERT
 * 分页优化：使用 fetchAllPagesParallel 替代旧串行 while 循环
 * @module services/erp-sync/datasets/inventory
 */

import { erpPost } from '../../erp-client/erp-client';
import { getErpDefaults } from '../../erp-client/erp-config';
import { fetchAllPagesParallel } from '../../erp-client/erp-pagination';
import type { SyncSourceConfig } from '../sync-types';

const PAGE_SIZE = 2000;

export const inventoryConfig: SyncSourceConfig = {
  id: 'inventory',
  name: '实时库存',
  type: 'snapshot',
  fetchAll: async () => {
    const { cid, uid } = getErpDefaults();
    const fetchPage = async (current: number) => {
      const result = await erpPost<{ data?: { records?: unknown[]; total?: number } }>(
        '/stock/report/query-realtime-stock-search',
        {
          current, size: PAGE_SIZE, warehouseIds: [], cwmSourceCidList: [],
          brandIds: [], mainSupplierIdList: [], goodsState: 'ENABLE',
          stockType: 'PHYSICAL', unitDisplayType: 'BASE_UNIT',
          costPriceType: 'MOVE_COST_PRICE', showZeroStock: true,
          dimList: [''], warehouseType: 0, states: [], cid, uid,
        },
        { pathPrefix: '/toliman/', businessType: 'inventory_fetch' }
      );
      return { records: result?.data?.records || [], total: result?.data?.total || 0 };
    };
    return fetchAllPagesParallel(fetchPage, PAGE_SIZE);
  },
  transform: (api: unknown) => {
    const r = api as Record<string, unknown>;
    return {
      goods_id: r.goodsId,
      warehouse_id: r.warehouseId,
      quality_type: r.qualityType ?? 'GOOD',
      goods_name: r.goodsName,
      short_name: r.shortName ?? null,
      available_base_quantity: r.availableBaseQuantity ?? 0,
      available_pkg_quantity: r.availablePkgQuantity ?? 0,
      base_cost_price: r.baseCostPrice ?? '0',
      pkg_cost_price: r.pkgCostPrice ?? '0',
      base_wholesale: r.baseWholesale ?? '0',
      pkg_wholesale: r.pkgWholesale ?? '0',
      warehouse_name: r.warehouseName ?? null,
      type_chain_name: r.typeChainName ?? null,
      type_name_level1: r.typeNameLevel1 ?? null,
      type_name_level2: r.typeNameLevel2 ?? null,
      type_name_level3: r.typeNameLevel3 ?? null,
      physical_base_quantity: r.physicalBaseQuantity ?? 0,
      physical_pkg_quantity: r.physicalPkgQuantity ?? 0,
      locked_base_quantity: r.lockedBaseQuantity ?? 0,
      locked_pkg_quantity: r.lockedPkgQuantity ?? 0,
      base_unit_name: r.baseUnitName ?? null,
      brand_id: r.brandId ?? null,
      brand_name: r.brandName ?? null,
      category_name: r.categoryName ?? null,
      state: r.state ?? null,
      physical_cost_amount: r.physicalCostAmount ?? '0',
      available_cost_amount: r.availableCostAmount ?? '0',
    };
  },
  targetTable: 'erp_inventory',
  primaryKey: ['goods_id', 'warehouse_id', 'quality_type'],
  intervalMs: 120000,
  pageSize: PAGE_SIZE,
  enableFallback: true,
  postProcessors: [
    { type: 'snapshot', targetTable: 'erp_inventory_snapshots_v2' },
  ],
};
