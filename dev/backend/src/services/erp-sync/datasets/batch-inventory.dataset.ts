/**
 * 批次库存数据集配置
 * Type A (snapshot): 每 2 分钟全量 UPSERT
 * 分页优化：使用 fetchAllPagesParallel 替代旧串行 while 循环
 * @module services/erp-sync/datasets/batch-inventory
 */

import { erpPost } from '../../erp-client/erp-client';
import { getErpDefaults } from '../../erp-client/erp-config';
import { fetchAllPagesParallel } from '../../erp-client/erp-pagination';
import { ERP_DUSHAN_WAREHOUSE_ID } from '../../../utils/constants';
import type { SyncSourceConfig } from '../sync-types';

const PAGE_SIZE = 2000;

export const batchInventoryConfig: SyncSourceConfig = {
  id: 'batch_inventory',
  name: '批次库存',
  type: 'snapshot',
  fetchAll: async () => {
    const { cid, uid } = getErpDefaults();
    const fetchPage = async (current: number) => {
      const result = await erpPost<{ data?: { records?: unknown[]; total?: number } }>(
        '/cwms/stock/wms-stock-detail',
        {
          current, size: PAGE_SIZE, searchImage: true,
          warehouseId: String(ERP_DUSHAN_WAREHOUSE_ID),
          unitDisplayType: 'BASE_UNIT', onlyZeroStockFile: false,
          isJoiner: false, cid, uid, total: 0,
        },
        { pathPrefix: '/toliman/', businessType: 'batch_inventory_fetch' }
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
      product_date: (r.productDate as string) || null,
      expire_date: (r.expireDate as string) || null,
      quality_type: r.qualityType ?? 'GOOD',
      goods_name: r.goodsName,
      unit_name: r.unitName ?? null,
      unit_factor_name: r.unitFactorName ?? null,
      days_to_expire: r.daysToExpire ?? null,
      days_from_product: r.daysFromProduct ?? null,
      shelf_life: r.shelfLife ?? null,
      quality_type_str: r.qualityTypeStr ?? null,
      convert_base_quantity: r.convertBaseQuantity ?? '0',
      convert_base_available_quantity: r.convertBaseAvailableQuantity ?? '0',
      quantity: r.quantity ?? null,
      available_quantity: r.availableQuantity ?? null,
      category_id: r.categoryId ?? null,
      category_name: r.categoryName ?? null,
      brand_id: r.brandId ?? null,
      brand_name: r.brandName ?? null,
      warehouse_name: r.warehouseName ?? null,
      volume: r.volume ?? null,
      weight: r.weight ?? null,
      alarm_percent: r.alarmPercent ?? null,
      is_alarm: r.isAlarm ?? 0,
      is_expire: r.isExpire ?? 0,
      stock_lot_str: r.stockLotStr ?? null,
    };
  },
  targetTable: 'erp_batch_inventory',
  syncMode: 'replace',  // ERP 数据存在完全重复行，使用 DELETE + INSERT 替代 UPSERT
  primaryKey: [],  // replace 模式不需要主键
  intervalMs: 120000,
  pageSize: PAGE_SIZE,
  enableFallback: true,
};
