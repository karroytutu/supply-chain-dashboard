/**
 * ERP 独山云仓批次库存服务
 * 通过舟谱 API 拉取批次库存数据，替代直连 xinshutong 数据库
 * @module services/erp-client/erp-batch-inventory.service
 */

import { erpPost } from './erp-client';
import { getErpDefaults } from './erp-config';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { ERP_DUSHAN_WAREHOUSE_ID } from '../../utils/constants';
import { appQuery } from '../../db/appPool';
import { createLogger } from '../../utils/logger';

const log = createLogger('ErpBatchInventory');

/** API 返回的批次库存记录 */
export interface ErpBatchInventory {
  goodsId: number;
  goodsName: string;
  unitName: string;
  productDate: string;
  expireDate: string;
  daysToExpire: number;
  shelfLife: number;
  qualityType: string;
  qualityTypeStr: string;
  convertBaseQuantity: string;
  convertBaseAvailableQuantity: string;
  quantity: string;
  availableQuantity: string;
  warehouseId: number;
  categoryName: string;
  brandName: string;
}

/** API 分页响应 */
interface ApiBatchResponse {
  code: number;
  data: {
    records: ErpBatchInventory[];
    total: number;
    current: number;
    size: number;
  };
}

/** 默认 pageSize */
const DEFAULT_PAGE_SIZE = 2000;

/**
 * 从 ERP API 全量拉取批次库存
 *
 * @param warehouseId - 仓库 ID，默认 ERP_DUSHAN_WAREHOUSE_ID（独山云仓）
 * @param skipCache - 是否绕过缓存
 */
export async function fetchAllBatchInventory(
  warehouseId = ERP_DUSHAN_WAREHOUSE_ID,
  skipCache = false
): Promise<ErpBatchInventory[]> {
  const cacheKey = CACHE_KEY.ERP_BATCH_INVENTORY;

  if (!skipCache) {
    const cached = cache.get<ErpBatchInventory[]>(cacheKey);
    if (cached) return cached;
  }

  const { cid, uid } = getErpDefaults();
  const allRecords: ErpBatchInventory[] = [];
  let current = 1;

  while (true) {
    const result = await erpPost<ApiBatchResponse>(
      '/cwms/stock/wms-stock-detail',
      {
        current,
        size: DEFAULT_PAGE_SIZE,
        searchImage: true,
        warehouseId: String(warehouseId),
        unitDisplayType: 'BASE_UNIT',
        onlyZeroStockFile: false,
        isJoiner: false,
        cid,
        uid,
        total: 0,
      },
      {
        pathPrefix: '/toliman/',
        businessType: 'batch_inventory_fetch',
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

  // 缓存（TTL 30s）
  cache.set(cacheKey, allRecords, CACHE_TTL.ERP_BASE);

  return allRecords;
}

/**
 * 按商品名称获取批次库存
 * 优先从本地 erp_batch_inventory 表查询，fallback 到 ERP API
 */
export async function getBatchInventoryByGoodsName(
  goodsName: string
): Promise<ErpBatchInventory[]> {
  // 优先从本地表查询
  try {
    const result = await appQuery<Record<string, unknown>>(
      `SELECT goods_id, goods_name, unit_name, product_date, expire_date,
              days_to_expire, shelf_life, quality_type, quality_type_str,
              convert_base_quantity, convert_base_available_quantity,
              quantity, available_quantity, warehouse_id, category_name, brand_name
       FROM erp_batch_inventory WHERE goods_name = $1`,
      [goodsName]
    );
    if (result.rows.length > 0) {
      return result.rows.map(mapLocalRowToBatchInventory);
    }
  } catch (err) {
    log.warn('本地表查询失败，fallback 到 ERP API:', err instanceof Error ? err.message : String(err));
  }

  // fallback
  const all = await fetchAllBatchInventory();
  return all.filter(r => r.goodsName === goodsName);
}

/**
 * 获取残次品批次库存
 * 优先从本地 erp_batch_inventory 表查询，fallback 到 ERP API
 */
export async function getDefectiveBatchInventory(): Promise<ErpBatchInventory[]> {
  // 优先从本地表查询
  try {
    const result = await appQuery<Record<string, unknown>>(
      `SELECT goods_id, goods_name, unit_name, product_date, expire_date,
              days_to_expire, shelf_life, quality_type, quality_type_str,
              convert_base_quantity, convert_base_available_quantity,
              quantity, available_quantity, warehouse_id, category_name, brand_name
       FROM erp_batch_inventory WHERE quality_type_str = '残次品'`
    );
    if (result.rows.length > 0) {
      return result.rows.map(mapLocalRowToBatchInventory);
    }
  } catch (err) {
    log.warn('本地表查询失败，fallback 到 ERP API:', err instanceof Error ? err.message : String(err));
  }

  // fallback
  const all = await fetchAllBatchInventory();
  return all.filter(r => r.qualityTypeStr === '残次品');
}

/** 本地表行 -> ErpBatchInventory 映射 */
function mapLocalRowToBatchInventory(row: Record<string, unknown>): ErpBatchInventory {
  return {
    goodsId: row.goods_id as number,
    goodsName: row.goods_name as string,
    unitName: (row.unit_name as string) || '',
    productDate: row.product_date as string,
    expireDate: row.expire_date as string,
    daysToExpire: (row.days_to_expire as number) || 0,
    shelfLife: (row.shelf_life as number) || 0,
    qualityType: (row.quality_type as string) || 'GOOD',
    qualityTypeStr: (row.quality_type_str as string) || '',
    convertBaseQuantity: (row.convert_base_quantity as string) || '0',
    convertBaseAvailableQuantity: (row.convert_base_available_quantity as string) || '0',
    quantity: (row.quantity as string) || '0',
    availableQuantity: (row.available_quantity as string) || '0',
    warehouseId: (row.warehouse_id as number) || 0,
    categoryName: (row.category_name as string) || '',
    brandName: (row.brand_name as string) || '',
  };
}

/**
 * 清除批次库存缓存
 */
export function invalidateBatchInventoryCache(): void {
  cache.invalidate(CACHE_KEY.ERP_BATCH_PREFIX);
}
