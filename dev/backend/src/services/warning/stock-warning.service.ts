/**
 * 缺货和低库存预警服务
 */

import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getStockSummaryMap, getCostPriceByNameMap } from '../erp-client/erp-inventory.service';
import { getDailySalesMap } from '../erp-client/erp-sales-detail.service';
import { convertStockUnits, parseUnitFactor, parseQuantity } from '../../utils/unitConverter';
import { getCategoryName } from '../../utils/arrayAggregation';
import { LOW_STOCK_DAYS, STANDARD_CALC_DAYS } from '../../utils/constants';
import { getStrategicGoodsIds } from './warning-cache';
import type { WarningProduct, PaginatedResult, StrategicLevel } from './warning.types';

interface WarningParams {
  page: number;
  pageSize: number;
  strategicLevel?: StrategicLevel;
}

/**
 * 获取缺货商品（通过 ERP API + 内存计算）
 */
export async function getOutOfStockProducts(
  params: WarningParams
): Promise<PaginatedResult<WarningProduct>> {
  const { page, pageSize, strategicLevel } = params;

  const strategicIds = await getStrategicGoodsIds();

  const [allProducts, stockMap, dailySalesMap] = await Promise.all([
    fetchAllProducts(0),
    getStockSummaryMap(),
    getDailySalesMap(STANDARD_CALC_DAYS),
  ]);

  // 过滤：启用 + 零库存
  let filtered = allProducts.filter(p => {
    const stock = stockMap.get(p.goodsId) ?? 0;
    return stock <= 0;
  });

  // 战略等级过滤
  if (strategicLevel === 'strategic') {
    if (strategicIds.size === 0) return { data: [], total: 0, page, pageSize, totalPages: 0 };
    filtered = filtered.filter(p => strategicIds.has(String(p.goodsId)));
  } else if (strategicLevel === 'normal' && strategicIds.size > 0) {
    filtered = filtered.filter(p => !strategicIds.has(String(p.goodsId)));
  }

  // 按日均销量降序
  filtered.sort((a, b) => (dailySalesMap.get(b.name) ?? 0) - (dailySalesMap.get(a.name) ?? 0));

  // 分页
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const pageItems = filtered.slice(offset, offset + pageSize);

  const data = pageItems.map(p => {
    const unitFactor = parseUnitFactor(p.unitFactor);
    const avgDaily = dailySalesMap.get(p.name) ?? 0;
    const baseAvgDaily = parseQuantity(avgDaily);
    const categoryName = getCategoryName(p.categoryChainName);

    return {
      productId: String(p.goodsId),
      productCode: String(p.goodsId),
      productName: p.name,
      categoryId: String(p.goodsId),
      categoryName,
      brand: null,
      specification: null,
      stock: { quantity: 0, unitName: p.pkgUnitName || '个', warehouseLocation: null },
      turnover: { days: 0, avgDailySales: Math.round((baseAvgDaily / unitFactor) * 100) / 100 },
      expiring: { daysToExpiry: null, expiryDate: null },
      availability: { status: 'out_of_stock' as const },
      strategicLevel: strategicIds.has(String(p.goodsId)) ? 'strategic' as const : 'normal' as const,
    };
  });

  return { data, total, page, pageSize, totalPages };
}

/**
 * 获取低库存商品（通过 ERP API + 内存计算）
 */
export async function getLowStockProducts(
  params: WarningParams
): Promise<PaginatedResult<WarningProduct>> {
  const { page, pageSize, strategicLevel } = params;

  const strategicIds = await getStrategicGoodsIds();

  const [allProducts, stockMap, dailySalesMap] = await Promise.all([
    fetchAllProducts(0),
    getStockSummaryMap(),
    getDailySalesMap(STANDARD_CALC_DAYS),
  ]);

  // 过滤：启用 + 有库存 + 有日均销量 + 可售天数 <= LOW_STOCK_DAYS
  let filtered = allProducts.filter(p => {
    const stock = stockMap.get(p.goodsId) ?? 0;
    const avgDaily = dailySalesMap.get(p.name) ?? 0;
    if (stock <= 0 || avgDaily <= 0) return false;
    const turnoverDays = stock / avgDaily;
    return turnoverDays <= LOW_STOCK_DAYS;
  });

  // 战略等级过滤
  if (strategicLevel === 'strategic') {
    if (strategicIds.size === 0) return { data: [], total: 0, page, pageSize, totalPages: 0 };
    filtered = filtered.filter(p => strategicIds.has(String(p.goodsId)));
  } else if (strategicLevel === 'normal' && strategicIds.size > 0) {
    filtered = filtered.filter(p => !strategicIds.has(String(p.goodsId)));
  }

  // 按可售天数升序，日均销量降序
  filtered.sort((a, b) => {
    const aStock = stockMap.get(a.goodsId) ?? 0;
    const bStock = stockMap.get(b.goodsId) ?? 0;
    const aDaily = dailySalesMap.get(a.name) ?? 1;
    const bDaily = dailySalesMap.get(b.name) ?? 1;
    const aTurnover = aStock / aDaily;
    const bTurnover = bStock / bDaily;
    if (aTurnover !== bTurnover) return aTurnover - bTurnover;
    return bDaily - aDaily;
  });

  // 分页
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const pageItems = filtered.slice(offset, offset + pageSize);

  const data = pageItems.map(p => {
    const unitFactor = parseUnitFactor(p.unitFactor);
    const stock = stockMap.get(p.goodsId) ?? 0;
    const avgDaily = dailySalesMap.get(p.name) ?? 1;
    const baseQuantity = parseQuantity(stock);
    const baseAvgDaily = parseQuantity(avgDaily);
    const turnoverDays = Math.round(stock / avgDaily);
    const categoryName = getCategoryName(p.categoryChainName);

    const converted = convertStockUnits({
      baseQuantity,
      baseAvgDaily,
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
        warehouseLocation: null,
      },
      turnover: {
        days: turnoverDays,
        avgDailySales: Math.round(converted.displayAvgDaily * 100) / 100,
      },
      expiring: { daysToExpiry: null, expiryDate: null },
      availability: { status: 'low_stock' as const },
      strategicLevel: strategicIds.has(String(p.goodsId)) ? 'strategic' as const : 'normal' as const,
    };
  });

  return { data, total, page, pageSize, totalPages };
}
