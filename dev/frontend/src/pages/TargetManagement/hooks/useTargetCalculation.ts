/**
 * 目标计算工具 Hook
 * 提供品类汇总、目标拆分、环比计算等纯计算逻辑
 */
import { useCallback } from 'react';
import type { CustomerTarget, CategoryTarget, ProductTarget, TargetSummary, SplitMethod } from '@/types/target-management';

/** 计算环比变化率 */
function calcMomChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/** 计算品类汇总（从商品行求和） */
function aggregateCategory(category: CategoryTarget) {
  return category.products.reduce(
    (acc, p) => ({
      targetAmount: acc.targetAmount + p.targetAmount,
      lastMonthTarget: acc.lastMonthTarget + p.lastMonthTarget,
      actualAmountLastMonth: acc.actualAmountLastMonth + p.actualAmountLastMonth,
      actualAmountPrevMonth: acc.actualAmountPrevMonth + p.actualAmountPrevMonth,
    }),
    { targetAmount: 0, lastMonthTarget: 0, actualAmountLastMonth: 0, actualAmountPrevMonth: 0 }
  );
}

/** 按历史销售占比拆分品类目标到商品 */
function splitByProportion(category: CategoryTarget, targetAmount: number): ProductTarget[] {
  const totalActual = category.products.reduce((sum, p) => sum + p.actualAmountLastMonth, 0);
  if (totalActual === 0) {
    return splitEvenly(category, targetAmount);
  }
  return category.products.map((p) => {
    const ratio = p.actualAmountLastMonth / totalActual;
    const amount = Math.round(targetAmount * ratio);
    return { ...p, targetAmount: amount };
  });
}

/** 平均分摊品类目标到商品 */
function splitEvenly(category: CategoryTarget, targetAmount: number): ProductTarget[] {
  const count = category.products.length;
  if (count === 0) return [];
  const perAmount = Math.round(targetAmount / count);
  return category.products.map((p) => {
    return { ...p, targetAmount: perAmount };
  });
}

/** 计算汇总数据 */
function calcSummary(customers: CustomerTarget[]): TargetSummary {
  let totalTargetAmount = 0;
  let totalCustomers = customers.length;
  let coveredCustomers = 0;
  let totalProducts = 0;
  let coveredProducts = 0;
  const marketerIds = new Set<string>();

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

  return { totalTargetAmount, marketerCount, coveredCustomers, totalCustomers, coveredProducts, totalProducts, amountPerMarketer, amountPerCustomer, completionRate: null, fillProgress };
}

/** 计算客户目标汇总金额 */
function calcCustomerTotal(customer: CustomerTarget): number {
  return customer.categories.reduce(
    (sum, cat) => sum + cat.products.reduce((s, p) => s + p.targetAmount, 0),
    0
  );
}

export function useTargetCalculation() {
  const getMomChange = useCallback(calcMomChange, []);

  const getCategoryAggregates = useCallback(aggregateCategory, []);

  const splitCategoryTarget = useCallback((category: CategoryTarget, targetAmount: number, method: SplitMethod): ProductTarget[] => {
    return method === 'by_proportion' ? splitByProportion(category, targetAmount) : splitEvenly(category, targetAmount);
  }, []);

  const calculateSummary = useCallback(calcSummary, []);

  const getCustomerTotal = useCallback(calcCustomerTotal, []);

  const updateProductTarget = useCallback((
    customers: CustomerTarget[],
    customerId: string,
    categoryId: string,
    productId: string,
    field: 'targetAmount' | 'remark',
    value: number | string,
    unitPrice: number,
  ): CustomerTarget[] => {
    return customers.map((c) => {
      if (c.customerId !== customerId) return c;
      return {
        ...c,
        categories: c.categories.map((cat) => {
          if (cat.categoryId !== categoryId) return cat;
          return {
            ...cat,
            products: cat.products.map((p) => {
              if (p.productId !== productId) return p;
              const updated = { ...p, [field]: value };
              if (field === 'targetAmount' && typeof value === 'number') {
                // 金额变更，无需联动量
              }
              return updated;
            }),
          };
        }),
      };
    });
  }, []);

  const updateCategoryTarget = useCallback((
    customers: CustomerTarget[],
    customerId: string,
    categoryId: string,
    field: 'targetAmount',
    value: number,
  ): CustomerTarget[] => {
    return customers.map((c) => {
      if (c.customerId !== customerId) return c;
      return {
        ...c,
        categories: c.categories.map((cat) => {
          if (cat.categoryId !== categoryId) return cat;
          return { ...cat, [field]: value };
        }),
      };
    });
  }, []);

  const applySplit = useCallback((
    customers: CustomerTarget[],
    customerId: string,
    categoryId: string,
    method: SplitMethod,
    targetAmount: number,
  ): CustomerTarget[] => {
    return customers.map((c) => {
      if (c.customerId !== customerId) return c;
      return {
        ...c,
        categories: c.categories.map((cat) => {
          if (cat.categoryId !== categoryId) return cat;
          const newProducts = splitCategoryTarget(cat, targetAmount, method);
          return { ...cat, targetAmount, products: newProducts };
        }),
      };
    });
  }, [splitCategoryTarget]);

  const addCustomers = useCallback((
    existing: CustomerTarget[],
    newCustomers: Array<{ customerId: string; customerName: string }>,
    marketerId: string,
    marketerName: string,
  ): CustomerTarget[] => {
    const existingIds = new Set(existing.map((c) => c.customerId));
    const additions: CustomerTarget[] = newCustomers
      .filter((nc) => !existingIds.has(nc.customerId))
      .map((nc) => ({
        customerId: nc.customerId,
        customerName: nc.customerName,
        isPlannedNew: true,
        marketerId,
        marketerName,
        categories: [],
      }));
    return [...existing, ...additions];
  }, []);

  const addProductsToCustomer = useCallback((
    customers: CustomerTarget[],
    customerId: string,
    newProducts: Array<{ productId: string; productName: string; categoryId: string; categoryName: string; unit: string; unitPrice: number }>,
  ): CustomerTarget[] => {
    return customers.map((c) => {
      if (c.customerId !== customerId) return c;
      const cats = [...c.categories];
      for (const np of newProducts) {
        let catIdx = cats.findIndex((cat) => cat.categoryId === np.categoryId);
        if (catIdx === -1) {
          cats.push({
            categoryId: np.categoryId,
            categoryName: np.categoryName,
            targetAmount: 0,
            actualAmountLastMonth: 0, actualAmountPrevMonth: 0,
            products: [],
          });
          catIdx = cats.length - 1;
        }
        const existingIds = new Set(cats[catIdx].products.map((p) => p.productId));
        if (!existingIds.has(np.productId)) {
          cats[catIdx] = {
            ...cats[catIdx],
            products: [
              ...cats[catIdx].products,
              {
                productId: np.productId,
                productName: np.productName,
                unit: np.unit,
                unitPrice: np.unitPrice,
                targetAmount: 0,
                lastMonthTarget: 0,
                actualAmountLastMonth: 0, actualAmountPrevMonth: 0,
                remark: '',
                isPlannedNew: true,
              },
            ],
          };
        }
      }
      return { ...c, categories: cats };
    });
  }, []);

  return {
    getMomChange,
    getCategoryAggregates,
    splitCategoryTarget,
    calculateSummary,
    getCustomerTotal,
    updateProductTarget,
    updateCategoryTarget,
    applySplit,
    addCustomers,
    addProductsToCustomer,
  };
}
