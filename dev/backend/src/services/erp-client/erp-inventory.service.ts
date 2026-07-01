/**
 * ERP 实时库存服务
 * 通过舟谱 API 拉取库存数据，替代直连 xinshutong 数据库
 * @module services/erp-client/erp-inventory.service
 */

import { erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { aggregateSum } from '../../utils/arrayAggregation';
import { invalidateFacadeCache } from './erp-data-facade';
import { appQuery } from '../../db/appPool';
import { createLogger } from '../../utils/logger';

const log = createLogger('ErpInventoryService');

/** API 返回的库存记录 */
export interface ErpInventoryRecord {
  goodsId: number;
  goodsName: string;
  availableBaseQuantity: number;
  baseCostPrice: string;
  warehouseId: number;
  warehouseName: string;
  typeChainName: string;
  qualityType: string;
  physicalBaseQuantity: number;
  lockedBaseQuantity: number;
  availablePkgQuantity: number;
  pkgCostPrice: string;
  baseUnitName: string;
  brandName?: string;
}

/** API 分页响应 */
interface ApiInventoryResponse {
  code: number;
  data: {
    records: ErpInventoryRecord[];
    total: number;
    current: number;
    size: number;
  };
}

/** 默认 pageSize（实测 2000 最优） */
const DEFAULT_PAGE_SIZE = 2000;

/**
 * 从 ERP API 全量拉取实时库存
 *
 * @param skipCache - 为 true 时绕过缓存
 * @returns 库存记录数组（含零库存）
 */
/** in-flight 去重：多个并发调用共享同一 Promise，避免冷缓存时重复请求 ERP */
let _inventoryInFlight: Promise<ErpInventoryRecord[]> | null = null;

export async function fetchAllInventory(skipCache = false): Promise<ErpInventoryRecord[]> {
  const cacheKey = CACHE_KEY.ERP_INVENTORY_ALL;

  if (!skipCache) {
    const cached = cache.get<ErpInventoryRecord[]>(cacheKey);
    if (cached) return cached;
  }

  // in-flight 去重
  if (!skipCache && _inventoryInFlight) return _inventoryInFlight;

  const doFetch = async (): Promise<ErpInventoryRecord[]> => {
    const { cid, uid } = getErpDefaults();
    const allRecords: ErpInventoryRecord[] = [];
    let current = 1;

    while (true) {
      const result = await erpPost<ApiInventoryResponse>(
        '/stock/report/query-realtime-stock-search',
        {
          current,
          size: DEFAULT_PAGE_SIZE,
          warehouseIds: [],
          cwmSourceCidList: [],
          brandIds: [],
          mainSupplierIdList: [],
          goodsState: 'ENABLE',
          stockType: 'PHYSICAL',
          unitDisplayType: 'BASE_UNIT',
          costPriceType: 'MOVE_COST_PRICE',
          showZeroStock: true,
          dimList: [''],
          warehouseType: 0,
          states: [],
          cid,
          uid,
        },
        {
          pathPrefix: '/toliman/',
          businessType: 'inventory_fetch',
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

    // 写入缓存（TTL 30s）
    cache.set(cacheKey, allRecords, CACHE_TTL.ERP_BASE);

    // [ERP本地化] 旧的模块级预聚合缓存已移除，由本地表 + MemoryCache 接管

    return allRecords;
  };

  _inventoryInFlight = doFetch();
  try {
    return await _inventoryInFlight;
  } finally {
    _inventoryInFlight = null;
  }
}

// [ERP本地化] 旧的模块级预聚合缓存已移除，由本地 PostgreSQL 表 + MemoryCache 接管
// 原 _stockSummaryMap / _stockByNameMap / _costPriceByNameMap 已删除

/**
 * 获取库存汇总 Map（按 goodsId 聚合可用库存）
 * 优先从本地 erp_inventory 表 SQL 聚合，fallback 到内存聚合
 */
export async function getStockSummaryMap(): Promise<Map<number, number>> {
  // 优先从本地表 SQL 聚合
  try {
    const result = await appQuery<{ goods_id: number; total_qty: string }>(
      'SELECT goods_id, SUM(available_base_quantity) AS total_qty FROM erp_inventory GROUP BY goods_id'
    );
    if (result.rows.length > 0) {
      const map = new Map<number, number>();
      result.rows.forEach(r => map.set(r.goods_id, Number(r.total_qty) || 0));
      return map;
    }
  } catch (err) {
    log.warn('本地表聚合失败，fallback 到内存聚合:', err instanceof Error ? err.message : String(err));
  }

  // fallback：内存聚合
  const inventory = await fetchAllInventory();
  const rawMap = aggregateSum(inventory, r => String(r.goodsId), r => r.availableBaseQuantity);
  const result = new Map<number, number>();
  rawMap.forEach((val, key) => result.set(Number(key), val));
  return result;
}

/**
 * 获取库存汇总 Map（按 goodsName 聚合可用库存）
 * 优先从本地 erp_inventory 表 SQL 聚合，fallback 到内存聚合
 */
export async function getStockByNameMap(): Promise<Map<string, number>> {
  // 优先从本地表 SQL 聚合
  try {
    const result = await appQuery<{ goods_name: string; total_qty: string }>(
      'SELECT goods_name, SUM(available_base_quantity) AS total_qty FROM erp_inventory GROUP BY goods_name'
    );
    if (result.rows.length > 0) {
      const map = new Map<string, number>();
      result.rows.forEach(r => map.set(r.goods_name, Number(r.total_qty) || 0));
      return map;
    }
  } catch (err) {
    log.warn('本地表聚合失败，fallback 到内存聚合:', err instanceof Error ? err.message : String(err));
  }

  // fallback：内存聚合
  const inventory = await fetchAllInventory();
  return aggregateSum(inventory, r => r.goodsName, r => r.availableBaseQuantity);
}

/**
 * 获取加权平均成本价 Map（按 goodsName）
 * 优先从本地 erp_inventory 表 SQL 聚合，fallback 到内存聚合
 */
export async function getCostPriceByNameMap(): Promise<Map<string, number>> {
  // 优先从本地表 SQL 聚合（加权平均成本）
  try {
    const result = await appQuery<{ goods_name: string; avg_cost: string }>(
      `SELECT goods_name,
              CASE WHEN SUM(available_base_quantity) > 0
                THEN SUM(base_cost_price::numeric * available_base_quantity) / SUM(available_base_quantity)
                ELSE 0
              END AS avg_cost
       FROM erp_inventory WHERE available_base_quantity > 0 GROUP BY goods_name`
    );
    if (result.rows.length > 0) {
      const map = new Map<string, number>();
      result.rows.forEach(r => map.set(r.goods_name, Number(r.avg_cost) || 0));
      return map;
    }
  } catch (err) {
    log.warn('本地表聚合失败，fallback 到内存聚合:', err instanceof Error ? err.message : String(err));
  }

  // fallback：内存聚合
  const inventory = await fetchAllInventory();
  const costMap = new Map<string, { totalCost: number; totalQty: number }>();
  for (const record of inventory) {
    const costPrice = parseFloat(record.baseCostPrice) || 0;
    const qty = record.availableBaseQuantity;
    if (qty <= 0) continue;
    const existing = costMap.get(record.goodsName) || { totalCost: 0, totalQty: 0 };
    existing.totalCost += costPrice * qty;
    existing.totalQty += qty;
    costMap.set(record.goodsName, existing);
  }
  const result = new Map<string, number>();
  costMap.forEach((val, key) => {
    result.set(key, val.totalQty > 0 ? val.totalCost / val.totalQty : 0);
  });
  return result;
}

/**
 * 清除库存缓存（供缓存失效使用）
 */
export function invalidateInventoryCache(): void {
  cache.invalidate(CACHE_KEY.ERP_INVENTORY_PREFIX);
  invalidateFacadeCache();
}
