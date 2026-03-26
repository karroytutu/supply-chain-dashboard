/**
 * 预警商品服务模块入口
 */

import type { PaginationParams, PaginatedResult, WarningProduct } from './warning.types';
import { getStrategicGoodsIds, clearStrategicGoodsCache } from './warning-cache';
import { getOutOfStockProducts, getLowStockProducts } from './stock-warning.service';
import { getOverstockProducts, OVERSTOCK_MILD_DAYS, OVERSTOCK_MODERATE_DAYS, OVERSTOCK_SERIOUS_DAYS } from './overstock-warning.service';
import { getExpiringProducts } from './expiring-warning.service';
import { getSlowMovingProducts } from './slowmoving-warning.service';

// 预警类型映射表
const WARNING_TYPE_HANDLERS: Record<string, (page: number, pageSize: number) => Promise<PaginatedResult<WarningProduct>>> = {
  'out_of_stock': getOutOfStockProducts,
  'low_stock': getLowStockProducts,
  'mild_overstock': (page, pageSize) => getOverstockProducts(OVERSTOCK_MILD_DAYS, OVERSTOCK_MODERATE_DAYS, page, pageSize),
  'moderate_overstock': (page, pageSize) => getOverstockProducts(OVERSTOCK_MODERATE_DAYS, OVERSTOCK_SERIOUS_DAYS, page, pageSize),
  'serious_overstock': (page, pageSize) => getOverstockProducts(OVERSTOCK_SERIOUS_DAYS, null, page, pageSize),
  'expiring_7': (page, pageSize) => getExpiringProducts(0, 7, page, pageSize),
  'expiring_15': (page, pageSize) => getExpiringProducts(7, 15, page, pageSize),
  'expiring_30': (page, pageSize) => getExpiringProducts(15, 30, page, pageSize),
  'mild_slow_moving': (page, pageSize) => getSlowMovingProducts(7, 15, page, pageSize),
  'moderate_slow_moving': (page, pageSize) => getSlowMovingProducts(15, 30, page, pageSize),
  'serious_slow_moving': (page, pageSize) => getSlowMovingProducts(30, null, page, pageSize),
};

/**
 * 获取预警商品列表（统一入口）
 */
export async function getWarningProducts(
  warningType: string,
  pagination?: PaginationParams
): Promise<PaginatedResult<WarningProduct>> {
  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? 20;

  const handler = WARNING_TYPE_HANDLERS[warningType];
  if (!handler) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  return handler(page, pageSize);
}

// 导出缓存相关
export { getStrategicGoodsIds, clearStrategicGoodsCache };

// 导出各个预警服务（供直接调用）
export {
  getOutOfStockProducts,
  getLowStockProducts,
  getOverstockProducts,
  getExpiringProducts,
  getSlowMovingProducts,
};

// 导出常量
export { WARNING_TYPE_HANDLERS };

// 导出类型
export type {
  WarningProduct,
  PaginationParams,
  PaginatedResult,
} from './warning.types';
