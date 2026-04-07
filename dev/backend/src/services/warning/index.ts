/**
 * 预警商品服务模块入口
 */

import type { PaginationParams, PaginatedResult, WarningProduct, StrategicLevel } from './warning.types';
import { getStrategicGoodsIds, clearStrategicGoodsCache } from './warning-cache';
import { getOutOfStockProducts, getLowStockProducts } from './stock-warning.service';
import { getOverstockProducts, OVERSTOCK_MILD_DAYS, OVERSTOCK_MODERATE_DAYS, OVERSTOCK_SERIOUS_DAYS } from './overstock-warning.service';
import { getExpiringProducts } from './expiring-warning.service';
import { getSlowMovingProducts } from './slowmoving-warning.service';

// 预警类型处理器参数类型
interface WarningHandlerParams {
  page: number;
  pageSize: number;
  strategicLevel?: StrategicLevel;
}

// 预警类型映射表
const WARNING_TYPE_HANDLERS: Record<string, (params: WarningHandlerParams) => Promise<PaginatedResult<WarningProduct>>> = {
  'out_of_stock': getOutOfStockProducts,
  'low_stock': getLowStockProducts,
  'mild_overstock': (params) => getOverstockProducts(OVERSTOCK_MILD_DAYS, OVERSTOCK_MODERATE_DAYS, params),
  'moderate_overstock': (params) => getOverstockProducts(OVERSTOCK_MODERATE_DAYS, OVERSTOCK_SERIOUS_DAYS, params),
  'serious_overstock': (params) => getOverstockProducts(OVERSTOCK_SERIOUS_DAYS, null, params),
  'expiring_7': (params) => getExpiringProducts(0, 7, params),
  'expiring_15': (params) => getExpiringProducts(7, 15, params),
  'expiring_30': (params) => getExpiringProducts(15, 30, params),
  'mild_slow_moving': (params) => getSlowMovingProducts(7, 15, params),
  'moderate_slow_moving': (params) => getSlowMovingProducts(15, 30, params),
  'serious_slow_moving': (params) => getSlowMovingProducts(30, null, params),
};

/**
 * 获取预警商品列表（统一入口）
 */
export async function getWarningProducts(
  warningType: string,
  pagination?: PaginationParams
): Promise<PaginatedResult<WarningProduct>> {
  const params: WarningHandlerParams = {
    page: pagination?.page ?? 1,
    pageSize: pagination?.pageSize ?? 20,
    strategicLevel: pagination?.strategicLevel,
  };

  const handler = WARNING_TYPE_HANDLERS[warningType];
  if (!handler) {
    return { data: [], total: 0, page: params.page, pageSize: params.pageSize, totalPages: 0 };
  }

  return handler(params);
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
  StrategicLevel,
} from './warning.types';
