/**
 * 滞销预警服务
 */

import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getStockByNameMap, getCostPriceByNameMap } from '../erp-client/erp-inventory.service';
import { getLastSaleMap } from '../erp-client/erp-sales-detail.service';
import { convertStockUnits, parseUnitFactor, parseQuantity } from '../../utils/unitConverter';
import { getCategoryName } from '../../utils/arrayAggregation';
import { getStrategicGoodsIds } from './warning-cache';
import type { WarningProduct, PaginatedResult, StrategicLevel } from './warning.types';

interface WarningParams {
  page: number;
  pageSize: number;
  strategicLevel?: StrategicLevel;
}

/**
 * 获取滞销商品（通过 ERP API + 内存计算）
 */
export async function getSlowMovingProducts(
  minDays: number,
  maxDays: number | null,
  params: WarningParams
): Promise<PaginatedResult<WarningProduct>> {
  const { page, pageSize, strategicLevel } = params;

  const strategicIds = await getStrategicGoodsIds();

  const [allProducts, stockByName, costPriceByName, lastSaleMap] = await Promise.all([
    fetchAllProducts(0),
    getStockByNameMap(),
    getCostPriceByNameMap(),
    getLastSaleMap(),
  ]);

  const now = new Date();

  let filtered = allProducts.filter(p => {
    const stock = stockByName.get(p.name) ?? 0;
    if (stock <= 0) return false;
    const lastSaleTime = lastSaleMap.get(p.name);
    const daysWithoutSale = lastSaleTime
      ? Math.floor((now.getTime() - new Date(lastSaleTime).getTime()) / 86400000)
      : 999;
    if (daysWithoutSale <= minDays) return false;
    if (maxDays && daysWithoutSale > maxDays) return false;
    return true;
  });

  if (strategicLevel === 'strategic') {
    if (strategicIds.size === 0) return { data: [], total: 0, page, pageSize, totalPages: 0 };
    filtered = filtered.filter(p => strategicIds.has(String(p.goodsId)));
  } else if (strategicLevel === 'normal' && strategicIds.size > 0) {
    filtered = filtered.filter(p => !strategicIds.has(String(p.goodsId)));
  }

  filtered.sort((a, b) => {
    const aLast = lastSaleMap.get(a.name);
    const bLast = lastSaleMap.get(b.name);
    const aDays = aLast ? Math.floor((now.getTime() - new Date(aLast).getTime()) / 86400000) : 999;
    const bDays = bLast ? Math.floor((now.getTime() - new Date(bLast).getTime()) / 86400000) : 999;
    return bDays - aDays;
  });

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const data = pageItems.map(p => {
    const unitFactor = parseUnitFactor(p.unitFactor);
    const stock = stockByName.get(p.name) ?? 0;
    const costPrice = costPriceByName.get(p.name) ?? 0;
    const lastSaleTime = lastSaleMap.get(p.name);
    const daysWithoutSale = lastSaleTime
      ? Math.floor((now.getTime() - new Date(lastSaleTime).getTime()) / 86400000)
      : 999;
    const categoryName = getCategoryName(p.categoryChainName);

    const converted = convertStockUnits({
      baseQuantity: parseQuantity(stock),
      baseAvgDaily: 0,
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
      turnover: { days: 0, avgDailySales: 0 },
      expiring: { daysToExpiry: null, expiryDate: null },
      availability: { status: 'available' as const },
      slowMoving: {
        daysWithoutSale,
        lastSaleDate: lastSaleTime ? new Date(lastSaleTime).toISOString().split('T')[0] : null,
      },
      strategicLevel: strategicIds.has(String(p.goodsId))
        ? ('strategic' as const)
        : ('normal' as const),
    };
  });

  return { data, total, page, pageSize, totalPages };
}
