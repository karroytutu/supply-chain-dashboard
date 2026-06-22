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

    // 清除预聚合缓存
    _stockSummaryMap = null;
    _stockByNameMap = null;
    _costPriceByNameMap = null;

    return allRecords;
  };

  _inventoryInFlight = doFetch();
  try {
    return await _inventoryInFlight;
  } finally {
    _inventoryInFlight = null;
  }
}

/**
 * 二级预聚合缓存（从 MemoryCache 中的原始库存数据派生）
 *
 * 这些变量是对 fetchAllInventory() 返回的原始数据做聚合计算后的结果缓存，
 * 目的是避免每次调用 getStockSummaryMap/getStockByNameMap/getCostPriceByNameMap 时都重新聚合。
 *
 * 生命周期：
 * - 首次访问时延迟构建（lazy init），由对应的 get 函数触发
 * - 在 fetchAllInventory() 获取到新数据后自动清除（见上方 lines 104-106）
 * - 在 invalidateInventoryCache() 被外部调用时也会清除
 * - 清除后下次 get 调用会重新从 MemoryCache 读取原始数据并聚合
 *
 * 注意：这些缓存不走 MemoryCache 的 TTL 机制，但与原始缓存保持一致——
 * 原始缓存过期后 fetchAllInventory() 会重新拉取，同时清除这些预聚合缓存。
 */
let _stockSummaryMap: Map<number, number> | null = null;
let _stockByNameMap: Map<string, number> | null = null;
let _costPriceByNameMap: Map<string, number> | null = null;

/**
 * 获取库存汇总 Map（按 goodsId 聚合可用库存）
 * 替代 SQL: SELECT goodsId, SUM(availableBaseQuantity) GROUP BY goodsId
 */
export async function getStockSummaryMap(): Promise<Map<number, number>> {
  if (_stockSummaryMap) return _stockSummaryMap;

  const inventory = await fetchAllInventory();
  const rawMap = aggregateSum(
    inventory,
    r => String(r.goodsId),
    r => r.availableBaseQuantity
  );

  // aggregateSum returns Map<string, number>, convert to Map<number, number>
  const result = new Map<number, number>();
  rawMap.forEach((val, key) => result.set(Number(key), val));
  _stockSummaryMap = result;

  return _stockSummaryMap;
}

/**
 * 获取库存汇总 Map（按 goodsName 聚合可用库存）
 */
export async function getStockByNameMap(): Promise<Map<string, number>> {
  if (_stockByNameMap) return _stockByNameMap;

  const inventory = await fetchAllInventory();
  _stockByNameMap = aggregateSum(
    inventory,
    r => r.goodsName,
    r => r.availableBaseQuantity
  );

  return _stockByNameMap;
}

/**
 * 获取加权平均成本价 Map（按 goodsName）
 * 替代 SQL: SUM(baseCostPrice * availableBaseQuantity) / SUM(availableBaseQuantity)
 */
export async function getCostPriceByNameMap(): Promise<Map<string, number>> {
  if (_costPriceByNameMap) return _costPriceByNameMap;

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

  _costPriceByNameMap = new Map<string, number>();
  costMap.forEach((val, key) => {
    _costPriceByNameMap!.set(key, val.totalQty > 0 ? val.totalCost / val.totalQty : 0);
  });

  return _costPriceByNameMap;
}

/**
 * 清除库存缓存（供缓存失效使用）
 */
export function invalidateInventoryCache(): void {
  cache.invalidate(CACHE_KEY.ERP_INVENTORY_PREFIX);
  _stockSummaryMap = null;
  _stockByNameMap = null;
  _costPriceByNameMap = null;
  invalidateFacadeCache();
}
