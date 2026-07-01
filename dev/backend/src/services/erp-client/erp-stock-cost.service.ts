/**
 * ERP 库存成本汇总服务
 * 从库存 API + 销售明细 API 计算月度库存成本汇总
 * 替代原 xinshutong 数据库的 "近2月商品库存成本汇总" 表
 * @module services/erp-client/erp-stock-cost.service
 */

import { fetchAllInventory } from './erp-inventory.service';
import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';

/** 月度库存成本汇总 */
export interface MonthlyStockCost {
  month: string;
  totalCostAmount: number;
  totalQuantity: number;
  avgCostPrice: number;
}

/**
 * 获取指定月份的库存成本汇总
 * 替代原 SQL: SELECT ... FROM "近2月商品库存成本汇总" WHERE 月份 = $1
 *
 * @param month 月份（YYYY-MM 格式）
 */
export async function getStockCostByMonth(month: string): Promise<MonthlyStockCost> {
  const cacheKey = `erp:stock:cost:${month}`;

  const cached = cache.get<MonthlyStockCost>(cacheKey);
  if (cached) return cached;

  // 计算月份的起止日期
  const monthStart = `${month}-01`;
  const [year, mon] = month.split('-').map(Number);
  const lastDay = new Date(year, mon, 0).getDate();
  const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

  // 从库存 API 获取当前库存成本
  const allInventory = await fetchAllInventory();

  // 从本地表获取月度销售明细（只查需要的列）
  const salesResult = await appQuery(
    'SELECT finance_cost_price, base_quantity FROM erp_sales_details WHERE settle_time >= $1 AND settle_time < $2',
    [monthStart, monthEnd]
  );
  const salesDetails = salesResult.rows;

  // 计算月度出库成本（从销售明细）
  let totalCostAmount = 0;
  let totalQuantity = 0;

  for (const detail of salesDetails) {
    const costPrice = parseFloat(detail.finance_cost_price) || 0;
    const qty = detail.base_quantity || 0;
    totalCostAmount += costPrice * qty;
    totalQuantity += qty;
  }

  // 如果销售明细为空，使用当前库存成本作为近似值
  if (totalQuantity === 0) {
    for (const inv of allInventory) {
      const costPrice = parseFloat(inv.baseCostPrice) || 0;
      const qty = inv.availableBaseQuantity || 0;
      totalCostAmount += costPrice * qty;
      totalQuantity += qty;
    }
  }

  const avgCostPrice = totalQuantity > 0 ? totalCostAmount / totalQuantity : 0;

  const result: MonthlyStockCost = {
    month,
    totalCostAmount,
    totalQuantity,
    avgCostPrice,
  };

  // 缓存 60 分钟（月度数据变化频率低）
  cache.set(cacheKey, result, CACHE_TTL.LOW_FREQUENCY);

  return result;
}

/**
 * 获取近 N 个月的库存成本汇总列表
 *
 * @param months 月份数量，默认 2
 */
export async function getRecentStockCosts(months = 2): Promise<MonthlyStockCost[]> {
  const results: MonthlyStockCost[] = [];
  const now = new Date();

  for (let i = 0; i < months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const cost = await getStockCostByMonth(month);
    results.push(cost);
  }

  return results;
}
