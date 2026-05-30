/**
 * 临期预警服务
 */

import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getCostPriceByNameMap } from '../erp-client/erp-inventory.service';
import { fetchAllBatchInventory } from '../erp-client/erp-batch-inventory.service';
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
 * 获取临期商品（通过 ERP API + 内存计算）
 */
export async function getExpiringProducts(
  minDays: number,
  maxDays: number,
  params: WarningParams
): Promise<PaginatedResult<WarningProduct>> {
  const { page, pageSize, strategicLevel } = params;

  const strategicIds = await getStrategicGoodsIds();

  const [allProducts, costPriceByName, allBatchInventory] = await Promise.all([
    fetchAllProducts(0),
    getCostPriceByNameMap(),
    fetchAllBatchInventory(),
  ]);

  const productByName = new Map(allProducts.map(p => [p.name, p]));

  // 过滤批次库存：daysToExpire 在范围内
  const filteredBatches = allBatchInventory.filter(b =>
    b.daysToExpire > minDays && b.daysToExpire <= maxDays
  );

  // 按商品名聚合
  const batchByGoods = new Map<string, {
    totalBaseQty: number; totalCostAmount: number;
    minDaysToExpire: number; nearestExpiryDate: string;
  }>();

  for (const batch of filteredBatches) {
    const product = productByName.get(batch.goodsName);
    if (!product || product.state !== 0) continue;
    if (strategicLevel === 'strategic' && !strategicIds.has(String(product.goodsId))) continue;
    if (strategicLevel === 'normal' && strategicIds.size > 0 && strategicIds.has(String(product.goodsId))) continue;

    let baseQty = parseFloat(batch.convertBaseQuantity) || 0;
    if (baseQty <= 0) {
      const rawQty = parseFloat(batch.quantity) || 0;
      baseQty = batch.unitName === product.pkgUnitName
        ? rawQty * (product.unitFactor || 1) : rawQty;
    }

    const costPrice = costPriceByName.get(batch.goodsName) || 0;
    const costAmount = baseQty * costPrice;
    const existing = batchByGoods.get(batch.goodsName);

    if (existing) {
      existing.totalBaseQty += baseQty;
      existing.totalCostAmount += costAmount;
      if (batch.daysToExpire < existing.minDaysToExpire) {
        existing.minDaysToExpire = batch.daysToExpire;
        existing.nearestExpiryDate = batch.expireDate;
      }
    } else {
      batchByGoods.set(batch.goodsName, {
        totalBaseQty: baseQty, totalCostAmount: costAmount,
        minDaysToExpire: batch.daysToExpire, nearestExpiryDate: batch.expireDate,
      });
    }
  }

  let items = Array.from(batchByGoods.entries()).map(([goodsName, d]) => ({
    goodsName, product: productByName.get(goodsName)!, ...d,
  }));
  items.sort((a, b) => a.minDaysToExpire - b.minDaysToExpire);

  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);

  const data = pageItems.map(item => {
    const unitFactor = parseUnitFactor(item.product.unitFactor);
    const converted = convertStockUnits({
      baseQuantity: parseQuantity(item.totalBaseQty),
      baseAvgDaily: 0, unitFactor,
      baseUnitName: item.product.baseUnitName || '个',
      pkgUnitName: item.product.pkgUnitName || '个',
    });
    const categoryName = getCategoryName(item.product.categoryChainName);

    return {
      productId: String(item.product.goodsId),
      productCode: String(item.product.goodsId),
      productName: item.goodsName,
      categoryId: String(item.product.goodsId),
      categoryName, brand: null, specification: null,
      stock: {
        quantity: converted.displayQuantity, unitName: converted.displayUnit,
        costAmount: Math.round(item.totalCostAmount), warehouseLocation: null,
      },
      turnover: { days: 0, avgDailySales: 0 },
      expiring: { daysToExpiry: item.minDaysToExpire, expiryDate: item.nearestExpiryDate },
      availability: { status: 'available' as const },
      strategicLevel: strategicIds.has(String(item.product.goodsId))
        ? 'strategic' as const : 'normal' as const,
    };
  });

  return { data, total, page, pageSize, totalPages };
}
