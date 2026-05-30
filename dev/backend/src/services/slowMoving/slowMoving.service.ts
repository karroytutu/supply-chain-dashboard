/**
 * 滞销商品服务模块
 * 使用销售结算明细表和实时库存表计算
 * 滞销定义：超过7天未销售为轻度滞销，超过15天为中度滞销，超过30天为严重滞销
 */

import { fetchAllProducts } from '../erp-client/erp-product.service';
import { fetchAllInventory, getStockByNameMap } from '../erp-client/erp-inventory.service';
import { getLastSaleMap } from '../erp-client/erp-sales-detail.service';
import { getCategoryName } from '../../utils/arrayAggregation';
import {
  SLOW_MOVING_MILD_DAYS,
  SLOW_MOVING_MODERATE_DAYS,
  SLOW_MOVING_SERIOUS_DAYS,
} from '../../utils/constants';
import { convertStockUnits, parseUnitFactor, parseQuantity } from '../../utils/unitConverter';
import type {
  SlowMovingData,
  SlowMovingDistribution,
  SlowMovingWarningStats,
  WarningProduct,
  PaginationParams,
  PaginatedResult,
} from './slowMoving.types';

/**
 * 获取滞销商品占比数据（通过 ERP API + 内存计算）
 */
export async function getSlowMovingData(): Promise<SlowMovingData> {
  const [inventoryRecords, lastSaleMap] = await Promise.all([
    fetchAllInventory(),
    getLastSaleMap(),
  ]);

  const now = new Date();
  let totalCost = 0;
  let slowMovingCost = 0;
  let cost7_15 = 0;
  let cost15_30 = 0;
  let costOver30 = 0;
  let count7_15 = 0;
  let count15_30 = 0;
  let countOver30 = 0;

  for (const record of inventoryRecords) {
    if (record.availableBaseQuantity <= 0) continue;
    const costPrice = parseFloat(record.baseCostPrice) || 0;
    const availableCostAmount = record.availableBaseQuantity * costPrice;
    totalCost += availableCostAmount;

    const lastSaleTime = lastSaleMap.get(record.goodsName);
    let daysWithoutSale: number;
    if (!lastSaleTime) {
      daysWithoutSale = 999;
    } else {
      const lastDate = new Date(lastSaleTime);
      daysWithoutSale = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    if (daysWithoutSale > SLOW_MOVING_MILD_DAYS) {
      slowMovingCost += availableCostAmount;
    }
    if (daysWithoutSale > SLOW_MOVING_MILD_DAYS && daysWithoutSale <= SLOW_MOVING_MODERATE_DAYS) {
      cost7_15 += availableCostAmount;
      count7_15++;
    }
    if (daysWithoutSale > SLOW_MOVING_MODERATE_DAYS && daysWithoutSale <= SLOW_MOVING_SERIOUS_DAYS) {
      cost15_30 += availableCostAmount;
      count15_30++;
    }
    if (daysWithoutSale > SLOW_MOVING_SERIOUS_DAYS) {
      costOver30 += availableCostAmount;
      countOver30++;
    }
  }

  const slowMovingRate = totalCost > 0 ? Math.round((slowMovingCost / totalCost) * 1000) / 10 : 0;

  // 滞销分布
  const distribution: SlowMovingDistribution[] = [
    {
      range: '7-15天',
      label: '轻度滞销',
      count: Math.round(cost7_15),
      percentage: slowMovingCost > 0 ? Math.round((cost7_15 / slowMovingCost) * 100) : 0,
    },
    {
      range: '15-30天',
      label: '中度滞销',
      count: Math.round(cost15_30),
      percentage: slowMovingCost > 0 ? Math.round((cost15_30 / slowMovingCost) * 100) : 0,
    },
    {
      range: '>30天',
      label: '严重滞销',
      count: Math.round(costOver30),
      percentage: slowMovingCost > 0 ? Math.round((costOver30 / slowMovingCost) * 100) : 0,
    },
  ];

  return {
    value: slowMovingRate,
    unit: 'percent',
    trend: -1.2,
    trendDirection: 'down',
    distribution,
    categories: [],
    slowMovingCost: Math.round(slowMovingCost),
    totalCost: Math.round(totalCost),
    warningStats: {
      mildSlowMoving: count7_15,
      moderateSlowMoving: count15_30,
      seriousSlowMoving: countOver30,
    },
  };
}

/**
 * 获取滞销商品列表
 */
export async function getSlowMovingProducts(
  minDays: number,
  maxDays: number | null,
  page: number,
  pageSize: number
): Promise<PaginatedResult<WarningProduct>> {
  const [allProducts, stockByName, lastSaleMap] = await Promise.all([
    fetchAllProducts(0),
    getStockByNameMap(),
    getLastSaleMap(),
  ]);

  const now = new Date();
  const productByName = new Map(allProducts.map(p => [p.name, p]));

  // 过滤：有库存 + 无销售天数 > minDays
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

  // 按无销售天数降序
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
        warehouseLocation: null,
      },
      turnover: { days: 0, avgDailySales: 0 },
      expiring: { daysToExpiry: null, expiryDate: null },
      availability: { status: 'available' as const },
      slowMoving: {
        daysWithoutSale,
        lastSaleDate: lastSaleTime ? new Date(lastSaleTime).toISOString().split('T')[0] : null,
      },
    };
  });

  return { data, total, page, pageSize, totalPages };

  return { data, total, page, pageSize, totalPages };
}
