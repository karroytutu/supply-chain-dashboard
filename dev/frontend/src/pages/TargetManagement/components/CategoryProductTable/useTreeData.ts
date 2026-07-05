/**
 * 品类商品表格 - 树形数据构建 Hook
 * 将客户品类/商品数据构建为 Ant Design Table 所需的嵌套树形结构
 * 同时预计算提成数据，避免列渲染时逐行重复计算
 */
import { useMemo } from 'react';
import type { CustomerTarget, CategoryTarget } from '@/types/target-management';
import { formatChangeRate } from '@/utils/format';
import { calcCommission } from '../../hooks/useTargetCalculation';

/** 品类聚合结果类型 */
export interface CatAggregates {
  targetAmount: number;
  lastMonthTarget: number;
  actualAmountLastMonth: number;
  actualAmountPrevMonth: number;
  estimatedGrossProfit: number;
  lastMonthGrossProfit: number;
}

/** 行类型（品类行含 children 子行，商品行无 children） */
export interface TableRow {
  key: string;
  rowType: 'category' | 'product';
  categoryId: string;
  categoryName?: string;
  /** 品类行聚合数据 */
  agg?: CatAggregates & {
    lastMom: { text: string; color: string };
    growth: number;
    expectedMom: { text: string; color: string };
    commission: { baseCommission: number; incrementCommission: number };
  };
  /** 品类行的 remark */
  categoryRemark?: string;
  /** 商品行原始数据 */
  product?: import('@/types/target-management').ProductTarget;
  /** 商品行预计算的提成 */
  productCommission?: { baseCommission: number; incrementCommission: number };
  /** 品类行的子行（商品行数组） */
  children?: TableRow[];
}

export function useTreeData(
  customer: CustomerTarget | null,
  getCategoryAggregates: (category: CategoryTarget) => CatAggregates,
) {
  return useMemo<TableRow[]>(() => {
    if (!customer) return [];
    return customer.categories.map((cat) => {
      const agg = getCategoryAggregates(cat);
      const lastMom = formatChangeRate(agg.actualAmountLastMonth, agg.actualAmountPrevMonth);
      const expectedMom = formatChangeRate(agg.targetAmount, agg.actualAmountLastMonth);
      const commission = calcCommission(agg.estimatedGrossProfit, agg.lastMonthGrossProfit);

      const childRows: TableRow[] = cat.products.map((p) => ({
        key: `prod-${cat.categoryId}-${p.productId}`,
        rowType: 'product' as const,
        categoryId: cat.categoryId,
        product: p,
        // 预计算商品行提成，避免列渲染时重复计算
        productCommission: calcCommission(p.targetAmount * p.grossMarginRate, p.actualAmountLastMonth * p.grossMarginRate),
      }));

      return {
        key: `cat-${cat.categoryId}`,
        rowType: 'category' as const,
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        categoryRemark: cat.remark,
        agg: { ...agg, lastMom, growth: agg.targetAmount - agg.actualAmountLastMonth, expectedMom, commission },
        children: childRows,
      };
    });
  }, [customer, getCategoryAggregates]);
}
