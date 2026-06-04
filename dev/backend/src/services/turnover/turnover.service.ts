/**
 * 库存周转天数服务模块
 * 使用"近2月商品库存成本汇总"表计算
 * 库存周转天数 = 平均库存金额 / 日均出库成本金额
 */

import { fetchAllProducts } from '../erp-client/erp-product.service';
import { getStockByNameMap } from '../erp-client/erp-inventory.service';
import { getDailySalesMap } from '../erp-client/erp-sales-detail.service';
import { getStockCostByMonth } from '../erp-client/erp-stock-cost.service';
import { getCategoryName } from '../../utils/arrayAggregation';
import {
  STANDARD_CALC_DAYS,
  TURNOVER_EXCELLENT_DAYS,
  TURNOVER_GOOD_DAYS,
  TURNOVER_ATTENTION_DAYS,
  OVERSTOCK_MILD_DAYS,
  OVERSTOCK_MODERATE_DAYS,
  OVERSTOCK_SERIOUS_DAYS,
  getTurnoverHealthStatus,
} from '../../utils/constants';
import type {
  TurnoverData,
  CategoryMetric,
  TurnoverWarningStats,
  TrendDirection,
} from './turnover.types';

/**
 * 获取库存周转天数数据
 */
export async function getTurnoverData(): Promise<TurnoverData> {
  // 获取本月和上月的数据月份
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth() + 1;
  const currentMonth = `${currentYear}-${String(currentMonthIndex).padStart(2, '0')}`;

  const prevMonthIndex = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear = now.getMonth() === 0 ? currentYear - 1 : currentYear;
  const prevMonth = `${prevYear}-${String(prevMonthIndex).padStart(2, '0')}`;

  // 通过库存成本服务计算本月周转天数（替代原 SQL 查询 "近2月商品库存成本汇总"）
  const currentCost = await getStockCostByMonth(currentMonth);
  const prevCost = await getStockCostByMonth(prevMonth);

  // 周转天数 = 平均库存金额 / 日均出库成本
  const currentTurnover =
    currentCost.totalCostAmount > 0
      ? Math.round(
          currentCost.totalCostAmount / 2 / (currentCost.totalCostAmount / STANDARD_CALC_DAYS)
        ) || 0
      : 0;
  const prevTurnover =
    prevCost.totalCostAmount > 0
      ? Math.round(
          prevCost.totalCostAmount / 2 / (prevCost.totalCostAmount / STANDARD_CALC_DAYS)
        ) || 0
      : 0;

  // 计算环比
  let trend = 0;
  let trendDirection: TrendDirection = 'flat';
  if (prevTurnover > 0 && currentTurnover > 0) {
    trend = Math.round(((currentTurnover - prevTurnover) / prevTurnover) * 1000) / 10;
    if (trend > 0) trendDirection = 'up';
    else if (trend < 0) trendDirection = 'down';
  }

  // 获取健康状态
  const healthStatus = getTurnoverHealthStatus(currentTurnover);

  // 计算库存积压预警统计
  const warningStats = await getTurnoverWarningStats();

  // 获取品类周转数据
  const categories = await getCategoryTurnoverMetrics(currentMonth, prevMonth);

  return {
    value: Math.round(currentTurnover),
    unit: 'day',
    trend,
    trendDirection,
    healthStatus,
    categories: categories.slice(0, 10),
    warningStats,
    previousValue: Math.round(prevTurnover),
    period: {
      current: currentMonth,
      previous: prevMonth,
    },
  };
}

/**
 * 获取周转预警统计（通过 ERP API + 内存计算）
 */
async function getTurnoverWarningStats(): Promise<TurnoverWarningStats> {
  const [allProducts, stockByName, dailySales] = await Promise.all([
    fetchAllProducts(0),
    getStockByNameMap(),
    getDailySalesMap(STANDARD_CALC_DAYS),
  ]);

  const productNames = new Set(allProducts.map(p => p.name));
  let mildOverstock = 0;
  let moderateOverstock = 0;
  let seriousOverstock = 0;

  stockByName.forEach((totalQty, goodsName) => {
    if (!productNames.has(goodsName) || totalQty <= 0) return;
    const avgDaily = dailySales.get(goodsName);
    if (!avgDaily || avgDaily <= 0) return;
    const sellableDays = totalQty / avgDaily;
    if (sellableDays > OVERSTOCK_SERIOUS_DAYS) {
      seriousOverstock++;
    } else if (sellableDays > OVERSTOCK_MODERATE_DAYS) {
      moderateOverstock++;
    } else if (sellableDays > OVERSTOCK_MILD_DAYS) {
      mildOverstock++;
    }
  });

  return { mildOverstock, moderateOverstock, seriousOverstock };
}

/**
 * 获取品类周转指标（通过 ERP API + 内存计算）
 * 替代原 SQL 多表 JOIN + CTE 查询 "近2月商品库存成本汇总" + "商品档案"
 */
async function getCategoryTurnoverMetrics(
  currentMonth: string,
  prevMonth: string
): Promise<CategoryMetric[]> {
  // 获取本月和上月的库存成本
  const [currentCost, prevCost, allProducts] = await Promise.all([
    getStockCostByMonth(currentMonth),
    getStockCostByMonth(prevMonth),
    fetchAllProducts(0),
  ]);

  // 按品类聚合（使用商品的一级品类）
  const categoryMap = new Map<
    string,
    {
      productCount: number;
      currentOutAmount: number;
      prevOutAmount: number;
    }
  >();

  for (const product of allProducts) {
    const categoryName = product.categoryChainName
      ? getCategoryName(product.categoryChainName)
      : undefined;
    if (!categoryName) continue;

    if (!categoryMap.has(categoryName)) {
      categoryMap.set(categoryName, { productCount: 0, currentOutAmount: 0, prevOutAmount: 0 });
    }
    const cat = categoryMap.get(categoryName)!;
    cat.productCount++;
  }

  // 使用月度总成本按比例分配到各品类（简化近似）
  const totalProducts = allProducts.length;
  if (totalProducts > 0) {
    categoryMap.forEach(cat => {
      const ratio = cat.productCount / totalProducts;
      cat.currentOutAmount = currentCost.totalCostAmount * ratio;
      cat.prevOutAmount = prevCost.totalCostAmount * ratio;
    });
  }

  // 计算各品类周转天数
  const result: CategoryMetric[] = [];
  let index = 0;
  categoryMap.forEach((cat, categoryName) => {
    const avgDays =
      cat.currentOutAmount > 0
        ? Math.round(
            currentCost.totalCostAmount / 2 / (cat.currentOutAmount / STANDARD_CALC_DAYS)
          ) || 0
        : 0;
    const prevDaysValue =
      cat.prevOutAmount > 0
        ? Math.round(prevCost.totalCostAmount / 2 / (cat.prevOutAmount / STANDARD_CALC_DAYS)) || 0
        : 0;

    let catTrend = 0;
    let catTrendDirection: TrendDirection = 'flat';
    if (prevDaysValue > 0 && avgDays > 0) {
      catTrend = Math.round(((avgDays - prevDaysValue) / prevDaysValue) * 1000) / 10;
      if (catTrend > 0) catTrendDirection = 'up';
      else if (catTrend < 0) catTrendDirection = 'down';
    }

    result.push({
      categoryId: `C${String(index + 1).padStart(3, '0')}`,
      categoryName: categoryName || '未分类',
      value: Math.round(avgDays),
      trend: catTrend,
      trendDirection: catTrendDirection,
      productCount: cat.productCount,
    });
    index++;
  });

  // 按周转天数排序
  result.sort((a, b) => a.value - b.value);

  return result;
}
