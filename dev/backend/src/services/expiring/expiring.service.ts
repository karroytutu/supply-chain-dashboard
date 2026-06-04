/**
 * 临期商品服务模块
 * 负责临期商品统计和查询
 */

import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getStockByNameMap, getCostPriceByNameMap } from '../erp-client/erp-inventory.service';
import { fetchAllBatchInventory } from '../erp-client/erp-batch-inventory.service';
import { getCategoryName } from '../../utils/arrayAggregation';
import {
  EXPIRING_SERIOUS_DAYS,
  EXPIRING_WARNING_DAYS,
  EXPIRING_ATTENTION_DAYS,
  EXPIRING_RATE_SERIOUS,
  EXPIRING_RATE_WARNING,
  EXPIRING_RATE_ATTENTION,
  getExpiringThreshold,
  getExpiringWarningLevel,
} from '../../utils/constants';
import type {
  ExpiringData,
  ExpiringBreakdown,
  WarningProduct,
  PaginationParams,
  PaginatedResult,
  HealthStatus,
} from './expiring.types';

/**
 * 获取临期商品占比数据（通过 ERP API + 内存计算）
 */
export async function getExpiringData(): Promise<ExpiringData> {
  const [allProducts, costPriceByName, allBatches] = await Promise.all([
    fetchAllProducts(0),
    getCostPriceByNameMap(),
    fetchAllBatchInventory(),
  ]);

  const productByName = new Map(allProducts.map(p => [p.name, p]));

  let totalCost = 0;
  let expiringCost = 0;
  let within7Cost = 0;
  let within15Cost = 0;
  let within30Cost = 0;
  const expiringGoods = new Map<string, { w7: boolean; w15: boolean; w30: boolean }>();

  for (const batch of allBatches) {
    const product = productByName.get(batch.goodsName);
    if (!product || product.state !== 0) continue;

    const costPrice = parseFloat(String(costPriceByName.get(batch.goodsName) || '0')) || 0;
    const shelfLife = product.shelfLife || 90;
    let expiringThreshold: number;
    if (shelfLife <= 90) expiringThreshold = 30;
    else if (shelfLife <= 150) expiringThreshold = 45;
    else if (shelfLife <= 270) expiringThreshold = 60;
    else expiringThreshold = 90;

    const rawQty = parseFloat(batch.quantity) || 0;
    let baseQty: number;
    if (batch.unitName === product.baseUnitName) baseQty = rawQty;
    else if (batch.unitName === product.pkgUnitName) baseQty = rawQty * (product.unitFactor || 1);
    else baseQty = rawQty;

    const batchCost = baseQty * costPrice;
    totalCost += batchCost;
    const dte = batch.daysToExpire;

    if (dte <= expiringThreshold) expiringCost += batchCost;
    const existing = expiringGoods.get(batch.goodsName) || { w7: false, w15: false, w30: false };
    if (dte <= EXPIRING_SERIOUS_DAYS) {
      within7Cost += batchCost;
      existing.w7 = true;
    }
    if (dte > EXPIRING_SERIOUS_DAYS && dte <= EXPIRING_WARNING_DAYS) {
      within15Cost += batchCost;
      existing.w15 = true;
    }
    if (dte > EXPIRING_WARNING_DAYS && dte <= EXPIRING_ATTENTION_DAYS) {
      within30Cost += batchCost;
      existing.w30 = true;
    }
    expiringGoods.set(batch.goodsName, existing);
  }

  const within7Count = [...expiringGoods.values()].filter(e => e.w7).length;
  const within15Count = [...expiringGoods.values()].filter(e => e.w15).length;
  const within30Count = [...expiringGoods.values()].filter(e => e.w30).length;

  const expiringRate = totalCost > 0 ? Math.round((expiringCost / totalCost) * 1000) / 10 : 0;

  // 确定预警级别
  const warningLevel = getExpiringWarningLevel(expiringRate);

  // 确定健康状态
  let healthStatus: HealthStatus = 'excellent';
  if (expiringRate > EXPIRING_RATE_SERIOUS) healthStatus = 'warning';
  else if (expiringRate > EXPIRING_RATE_WARNING) healthStatus = 'attention';
  else if (expiringRate > EXPIRING_RATE_ATTENTION) healthStatus = 'good';

  // 临期分布
  const breakdown: ExpiringBreakdown[] = [
    {
      level: 'serious',
      label: '7天内',
      count: within7Count,
      percentage: totalCost > 0 ? Math.round((within7Cost / totalCost) * 1000) / 10 : 0,
      color: '#ff4d4f',
    },
    {
      level: 'warning',
      label: '15天内',
      count: within15Count,
      percentage: totalCost > 0 ? Math.round((within15Cost / totalCost) * 1000) / 10 : 0,
      color: '#faad14',
    },
    {
      level: 'attention',
      label: '30天内',
      count: within30Count,
      percentage: totalCost > 0 ? Math.round((within30Cost / totalCost) * 1000) / 10 : 0,
      color: '#fadb14',
    },
  ];

  return {
    value: expiringRate,
    unit: 'percent',
    trend: 0.5,
    trendDirection: 'up',
    healthStatus,
    warningLevel,
    breakdown,
    categories: [],
    within7Days: within7Count,
    within15Days: within15Count,
    within30Days: within30Count,
    expiringCost: Math.round(expiringCost),
    totalCost: Math.round(totalCost),
  };
}

/**
 * 获取临期商品列表（通过 ERP API + 内存计算）
 */
export async function getExpiringProducts(
  minDays: number,
  maxDays: number,
  page: number,
  pageSize: number
): Promise<PaginatedResult<WarningProduct>> {
  const [allProducts, stockByName, allBatches] = await Promise.all([
    fetchAllProducts(0),
    getStockByNameMap(),
    fetchAllBatchInventory(),
  ]);

  const productByName = new Map(allProducts.map(p => [p.name, p]));

  // 过滤批次：daysToExpire 在范围内，按商品聚合
  const batchByGoods = new Map<
    string,
    {
      totalQty: number;
      minDaysToExpire: number;
      nearestExpiryDate: string;
    }
  >();

  for (const batch of allBatches) {
    if (batch.daysToExpire <= minDays || batch.daysToExpire > maxDays) continue;
    const product = productByName.get(batch.goodsName);
    if (!product || product.state !== 0) continue;

    const rawQty = parseFloat(batch.quantity) || 0;
    const existing = batchByGoods.get(batch.goodsName);
    if (existing) {
      existing.totalQty += rawQty;
      if (batch.daysToExpire < existing.minDaysToExpire) {
        existing.minDaysToExpire = batch.daysToExpire;
        existing.nearestExpiryDate = batch.expireDate;
      }
    } else {
      batchByGoods.set(batch.goodsName, {
        totalQty: rawQty,
        minDaysToExpire: batch.daysToExpire,
        nearestExpiryDate: batch.expireDate,
      });
    }
  }

  const items = Array.from(batchByGoods.entries()).map(([goodsName, d]) => ({
    goodsName,
    product: productByName.get(goodsName)!,
    ...d,
  }));
  items.sort((a, b) => a.minDaysToExpire - b.minDaysToExpire);

  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);

  const data = pageItems.map(item => {
    const stock = stockByName.get(item.goodsName) ?? item.totalQty;
    const categoryName = getCategoryName(item.product.categoryChainName);
    return {
      productId: String(item.product.goodsId),
      productCode: String(item.product.goodsId),
      productName: item.goodsName,
      categoryId: String(item.product.goodsId),
      categoryName,
      brand: null,
      specification: null,
      stock: { quantity: parseInt(String(stock)) || 0, warehouseLocation: null },
      turnover: { days: 0, avgDailySales: 0 },
      expiring: { daysToExpiry: item.minDaysToExpire, expiryDate: item.nearestExpiryDate },
      availability: { status: 'available' as const },
    };
  });

  return { data, total, page, pageSize, totalPages };
}
