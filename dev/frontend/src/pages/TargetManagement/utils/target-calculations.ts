/**
 * 目标管理 - 纯计算工具函数
 * 提供品类汇总、目标拆分、环比计算、提成计算等纯计算逻辑
 * 无 React 依赖，可在任何地方直接 import 使用
 */
import type { CustomerTarget, CategoryTarget, ProductTarget, TargetSummary } from '@/types/target-management';
import type { MarketerOverview } from '@/services/api/sales-target';
import {
  COMMISSION_RATE_INCREMENT,
  COMMISSION_RATE_BASE,
  COMMISSION_RATE_LOW,
  COMMISSION_BASELINE_THRESHOLD,
} from '@/constants/commission';

/** 计算环比变化率 */
export function calcMomChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * 计算预计提成（基准提成 + 增量提成）
 * 基线 = 上月毛利，本月利润 = 预计毛利
 * 阶梯规则：
 * 1. 本月利润 >= 基线：基线 * COMMISSION_RATE_BASE + 增量 * COMMISSION_RATE_INCREMENT
 * 2. 基线 * COMMISSION_BASELINE_THRESHOLD <= 本月利润 < 基线：本月利润 * COMMISSION_RATE_BASE
 * 3. 本月利润 < 基线 * COMMISSION_BASELINE_THRESHOLD：本月利润 * COMMISSION_RATE_LOW
 */
export function calcCommission(
  estimatedGrossProfit: number,
  lastMonthGrossProfit: number,
): { baseCommission: number; incrementCommission: number } {
  const baseline = lastMonthGrossProfit;
  const profit = estimatedGrossProfit;

  if (baseline <= 0) {
    return { baseCommission: 0, incrementCommission: Math.round(profit * COMMISSION_RATE_INCREMENT * 100) / 100 };
  }

  if (profit >= baseline) {
    return {
      baseCommission: Math.round(baseline * COMMISSION_RATE_BASE * 100) / 100,
      incrementCommission: Math.round((profit - baseline) * COMMISSION_RATE_INCREMENT * 100) / 100,
    };
  }

  if (profit >= baseline * COMMISSION_BASELINE_THRESHOLD) {
    return { baseCommission: Math.round(profit * COMMISSION_RATE_BASE * 100) / 100, incrementCommission: 0 };
  }

  return { baseCommission: Math.round(profit * COMMISSION_RATE_LOW * 100) / 100, incrementCommission: 0 };
}

/** 计算品类汇总（从商品行求和） */
export function aggregateCategory(category: CategoryTarget) {
  return category.products.reduce(
    (acc, p) => ({
      targetAmount: acc.targetAmount + p.targetAmount,
      lastMonthTarget: acc.lastMonthTarget + p.lastMonthTarget,
      actualAmountLastMonth: acc.actualAmountLastMonth + p.actualAmountLastMonth,
      actualAmountPrevMonth: acc.actualAmountPrevMonth + p.actualAmountPrevMonth,
      estimatedGrossProfit: acc.estimatedGrossProfit + p.targetAmount * p.grossMarginRate,
      lastMonthGrossProfit: acc.lastMonthGrossProfit + p.actualAmountLastMonth * p.grossMarginRate,
    }),
    { targetAmount: 0, lastMonthTarget: 0, actualAmountLastMonth: 0, actualAmountPrevMonth: 0, estimatedGrossProfit: 0, lastMonthGrossProfit: 0 }
  );
}

/** 按历史销售占比拆分品类目标到商品（尾差补齐，确保总和精确等于 targetAmount） */
export function splitByProportion(category: CategoryTarget, targetAmount: number): ProductTarget[] {
  const totalActual = category.products.reduce((sum, p) => sum + p.actualAmountLastMonth, 0);
  if (totalActual === 0) {
    return splitEvenly(category, targetAmount);
  }
  const result = category.products.map((p, i) => {
    const ratio = p.actualAmountLastMonth / totalActual;
    // 最后一个商品用总额减去前面所有商品的和，消除舍入误差
    if (i === category.products.length - 1) {
      const allocatedSum = category.products.slice(0, i).reduce((sum, prev) => {
        return sum + Math.round(targetAmount * (prev.actualAmountLastMonth / totalActual));
      }, 0);
      return { ...p, targetAmount: targetAmount - allocatedSum };
    }
    return { ...p, targetAmount: Math.round(targetAmount * ratio) };
  });
  return result;
}

/** 平均分摊品类目标到商品（尾差补齐，确保总和精确等于 targetAmount） */
export function splitEvenly(category: CategoryTarget, targetAmount: number): ProductTarget[] {
  const count = category.products.length;
  if (count === 0) return [];
  const perAmount = Math.round(targetAmount / count);
  return category.products.map((p, i) => {
    // 最后一个商品用总额减去前面所有商品的和，消除舍入误差
    if (i === count - 1) {
      return { ...p, targetAmount: targetAmount - perAmount * (count - 1) };
    }
    return { ...p, targetAmount: perAmount };
  });
}

/** 计算汇总数据 */
export function calcSummary(customers: CustomerTarget[]): TargetSummary {
  let totalTargetAmount = 0;
  let totalCustomers = customers.length;
  let coveredCustomers = 0;
  let totalProducts = 0;
  let coveredProducts = 0;
  const marketerIds = new Set<number>();

  for (const c of customers) {
    let customerHasTarget = false;
    marketerIds.add(c.marketerId);
    for (const cat of c.categories) {
      for (const p of cat.products) {
        totalProducts++;
        if (p.targetAmount > 0) {
          coveredProducts++;
          customerHasTarget = true;
        }
        totalTargetAmount += p.targetAmount;
      }
    }
    if (customerHasTarget) coveredCustomers++;
  }

  const marketerCount = marketerIds.size;
  const amountPerMarketer = marketerCount > 0 ? totalTargetAmount / marketerCount : 0;
  const amountPerCustomer = coveredCustomers > 0 ? totalTargetAmount / coveredCustomers : 0;
  const fillProgress = totalProducts > 0 ? (coveredProducts / totalProducts) * 100 : 0;

  return { totalTargetAmount, marketerCount, coveredCustomers, totalCustomers, coveredProducts, totalProducts, amountPerMarketer, amountPerCustomer, fillProgress };
}

/** 计算客户目标汇总金额 */
export function calcCustomerTotal(customer: CustomerTarget): number {
  return customer.categories.reduce(
    (sum, cat) => sum + cat.products.reduce((s, p) => s + p.targetAmount, 0),
    0
  );
}

/**
 * 计算营销师摘要（从客户数据实时计算或使用后端概览数据）
 */
export function computeMarketerSummary(
  customers: CustomerTarget[],
  selectedMarketerId: number | null,
  currentTargetId: number | null,
  overviewData: { marketers: MarketerOverview[] } | null,
): MarketerOverview | null {
  if (!selectedMarketerId || !customers.length) return null;
  let targetAmount = 0;
  let lastMonthReal = 0;
  let estimatedGrossProfit = 0;
  let lastMonthGrossProfit = 0;
  for (const c of customers) {
    for (const cat of c.categories) {
      for (const p of cat.products) {
        targetAmount += p.targetAmount;
        lastMonthReal += p.actualAmountLastMonth;
        estimatedGrossProfit += p.targetAmount * p.grossMarginRate;
        lastMonthGrossProfit += p.actualAmountLastMonth * p.grossMarginRate;
      }
    }
  }
  const growthRate = lastMonthReal > 0
    ? (targetAmount - lastMonthReal) / lastMonthReal
    : null;
  const commission = calcCommission(estimatedGrossProfit, lastMonthGrossProfit);
  const overviewMarketer = overviewData?.marketers.find(
    (m) => m.id === selectedMarketerId,
  );
  const skuIds = new Set<string>();
  const categoryIds = new Set<string>();
  for (const c of customers) {
    for (const cat of c.categories) {
      categoryIds.add(cat.categoryId);
      for (const p of cat.products) skuIds.add(p.productId);
    }
  }
  return {
    id: selectedMarketerId,
    name: customers[0].marketerName || overviewMarketer?.name || '',
    targetAmount: Math.round(targetAmount * 100) / 100,
    lastMonthActual: Math.round(lastMonthReal * 100) / 100,
    growthRate: growthRate !== null ? Math.round(growthRate * 10000) / 10000 : null,
    hasSaved: !!currentTargetId,
    targetStatus: overviewMarketer?.targetStatus ?? null,
    customerCount: customers.length,
    lastMonthCustomerCount: overviewMarketer?.lastMonthCustomerCount ?? 0,
    skuCount: skuIds.size,
    lastMonthSkuCount: overviewMarketer?.lastMonthSkuCount ?? 0,
    categoryCount: categoryIds.size,
    lastMonthCategoryCount: overviewMarketer?.lastMonthCategoryCount ?? 0,
    avgCustomerValue: customers.length > 0
      ? Math.round(targetAmount / customers.length * 100) / 100 : 0,
    lastMonthAvgCustomerValue: overviewMarketer?.lastMonthAvgCustomerValue ?? 0,
    estimatedGrossProfit: Math.round(estimatedGrossProfit * 100) / 100,
    lastMonthGrossProfit: Math.round(lastMonthGrossProfit * 100) / 100,
    baseCommission: commission.baseCommission,
    incrementCommission: commission.incrementCommission,
  };
}
