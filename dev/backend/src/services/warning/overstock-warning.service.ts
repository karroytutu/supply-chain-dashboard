/**
 * 库存积压预警服务
 */

import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getStockByNameMap, getCostPriceByNameMap } from '../erp-client/erp-inventory.service';
import { getDailySalesMap } from '../erp-client/erp-sales-detail.service';
import { convertStockUnits, parseUnitFactor, parseQuantity } from '../../utils/unitConverter';
import { getCategoryName } from '../../utils/arrayAggregation';
import {
  OVERSTOCK_MILD_DAYS,
  OVERSTOCK_MODERATE_DAYS,
  OVERSTOCK_SERIOUS_DAYS,
  STANDARD_CALC_DAYS,
} from '../../utils/constants';
import { getStrategicGoodsIds } from './warning-cache';
import type { WarningProduct, PaginatedResult, StrategicLevel } from './warning.types';

interface WarningParams {
  page: number;
  pageSize: number;
  strategicLevel?: StrategicLevel;
}

/**
 * 获取库存积压商品（通过 ERP API + 内存计算）
 */
export async function getOverstockProducts(
  minDays: number,
  maxDays: number | null,
  params: WarningParams
): Promise<PaginatedResult<WarningProduct>> {
  const { page, pageSize, strategicLevel } = params;

  const strategicIds = await getStrategicGoodsIds();

  const [allProducts, stockByName, costPriceByName, dailySalesMap] = await Promise.all([
    fetchAllProducts(0),
    getStockByNameMap(),
    getCostPriceByNameMap(),
    getDailySalesMap(STANDARD_CALC_DAYS),
  ]);

  let filtered = allProducts.filter(p => {
    const stock = stockByName.get(p.name) ?? 0;
    const avgDaily = dailySalesMap.get(p.name) ?? 0;
    if (stock <= 0 || avgDaily <= 0) return false;
    const sellableDays = stock / avgDaily;
    if (sellableDays <= minDays) return false;
    if (maxDays && sellableDays > maxDays) return false;
    return true;
  });

  if (strategicLevel === 'strategic') {
    if (strategicIds.size === 0) return { data: [], total: 0, page, pageSize, totalPages: 0 };
    filtered = filtered.filter(p => strategicIds.has(String(p.goodsId)));
  } else if (strategicLevel === 'normal' && strategicIds.size > 0) {
    filtered = filtered.filter(p => !strategicIds.has(String(p.goodsId)));
  }

  filtered.sort((a, b) => {
    const aDays = (stockByName.get(a.name) ?? 0) / (dailySalesMap.get(a.name) ?? 1);
    const bDays = (stockByName.get(b.name) ?? 0) / (dailySalesMap.get(b.name) ?? 1);
    return bDays - aDays;
  });

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const data = pageItems.map(p => {
    const unitFactor = parseUnitFactor(p.unitFactor);
    const stock = stockByName.get(p.name) ?? 0;
    const avgDaily = dailySalesMap.get(p.name) ?? 1;
    const costPrice = costPriceByName.get(p.name) ?? 0;
    const sellableDays = stock / avgDaily;
    const categoryName = getCategoryName(p.categoryChainName);

    const converted = convertStockUnits({
      baseQuantity: parseQuantity(stock),
      baseAvgDaily: parseQuantity(avgDaily),
      unitFactor,
      baseUnitName: p.baseUnitName || '个',
      pkgUnitName: p.pkgUnitName || '个',
    });

    return {
      productId: String(p.goodsId),
      productCode: String(p.goodsId),
      productName: p.name,
      categoryId: String(p.goodsId),
      categoryName,
      brand: null,
      specification: null,
      stock: {
        quantity: converted.displayQuantity,
        unitName: converted.displayUnit,
        costAmount: Math.round(stock * costPrice),
        warehouseLocation: null,
      },
      turnover: {
        days: Math.round(sellableDays),
        avgDailySales: Math.round(converted.displayAvgDaily * 100) / 100,
      },
      expiring: { daysToExpiry: null, expiryDate: null },
      availability: { status: 'available' as const },
      strategicLevel: strategicIds.has(String(p.goodsId))
        ? ('strategic' as const)
        : ('normal' as const),
    };
  });

  return { data, total, page, pageSize, totalPages };
}

// 导出常量供 index.ts 使用
export { OVERSTOCK_MILD_DAYS, OVERSTOCK_MODERATE_DAYS, OVERSTOCK_SERIOUS_DAYS };
