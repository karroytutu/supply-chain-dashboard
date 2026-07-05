/**
 * 目标计算工具 Hook
 * 薄包装层：import 纯函数并 useCallback 包装供组件使用
 * 纯函数实现位于 utils/target-calculations.ts
 */
import { useCallback } from 'react';
import type { CategoryTarget, SplitMethod } from '@/types/target-management';
import {
  calcMomChange,
  calcCommission,
  aggregateCategory,
  splitByProportion,
  splitEvenly,
  calcSummary,
  calcCustomerTotal,
} from '../utils/target-calculations';

// Re-export 纯函数供其他模块直接 import（如 CategoryProductTable）
export { calcCommission, splitByProportion, splitEvenly } from '../utils/target-calculations';

export function useTargetCalculation() {
  const getMomChange = useCallback(calcMomChange, []);

  const getCategoryAggregates = useCallback(aggregateCategory, []);

  const splitCategoryTarget = useCallback((category: CategoryTarget, targetAmount: number, method: SplitMethod) => {
    return method === 'by_proportion' ? splitByProportion(category, targetAmount) : splitEvenly(category, targetAmount);
  }, []);

  const calculateSummary = useCallback(calcSummary, []);

  const getCustomerTotal = useCallback(calcCustomerTotal, []);

  return {
    getMomChange,
    getCategoryAggregates,
    splitCategoryTarget,
    calculateSummary,
    getCustomerTotal,
  };
}
