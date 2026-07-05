/**
 * 目标计算纯函数测试
 * @module pages/TargetManagement/hooks/useTargetCalculation.spec.ts
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  splitByProportion,
  splitEvenly,
  useTargetCalculation,
} from './useTargetCalculation';
import type { CategoryTarget, ProductTarget, CustomerTarget } from '@/types/target-management';

// =====================================================
// 测试辅助
// =====================================================

function buildProduct(overrides: Partial<ProductTarget> = {}): ProductTarget {
  return {
    productId: '1',
    productName: '商品A',
    unit: '箱',
    unitPrice: 10,
    targetAmount: 0,
    lastMonthTarget: 0,
    actualAmountLastMonth: 0,
    actualAmountPrevMonth: 0,
    grossMarginRate: 0,
    remark: '',
    isPlannedNew: false,
    ...overrides,
  };
}

function buildCategory(products: ProductTarget[], overrides: Partial<CategoryTarget> = {}): CategoryTarget {
  return {
    categoryId: 'cat_1',
    categoryName: '品类1',
    targetAmount: 0,
    actualAmountLastMonth: 0,
    actualAmountPrevMonth: 0,
    remark: '',
    products,
    ...overrides,
  };
}

// =====================================================
// calcMomChange (从 useTargetCalculation 中测试)
// =====================================================

describe('splitByProportion', () => {
  it('按上月实际销售占比分配目标金额', () => {
    const category = buildCategory([
      buildProduct({ productId: '1', actualAmountLastMonth: 600 }),
      buildProduct({ productId: '2', actualAmountLastMonth: 400 }),
    ]);

    const result = splitByProportion(category, 1000);

    // 商品1: 600/1000 * 1000 = 600
    expect(result[0].targetAmount).toBe(600);
    // 商品2: 400/1000 * 1000 = 400
    expect(result[1].targetAmount).toBe(400);
  });

  it('totalActual=0 时回退到平均分配', () => {
    const category = buildCategory([
      buildProduct({ productId: '1', actualAmountLastMonth: 0 }),
      buildProduct({ productId: '2', actualAmountLastMonth: 0 }),
    ]);

    const result = splitByProportion(category, 1000);

    // 无历史数据 → 平均分
    expect(result[0].targetAmount).toBe(500);
    expect(result[1].targetAmount).toBe(500);
  });

  it('四舍五入为整数', () => {
    const category = buildCategory([
      buildProduct({ productId: '1', actualAmountLastMonth: 1 }),
      buildProduct({ productId: '2', actualAmountLastMonth: 2 }),
    ]);

    const result = splitByProportion(category, 100);

    // 商品1: 1/3 * 100 = 33.33 → 33
    // 商品2: 2/3 * 100 = 66.67 → 67
    expect(result[0].targetAmount).toBe(33);
    expect(result[1].targetAmount).toBe(67);
  });

  it('单品时全额分配', () => {
    const category = buildCategory([
      buildProduct({ productId: '1', actualAmountLastMonth: 500 }),
    ]);

    const result = splitByProportion(category, 1000);

    expect(result[0].targetAmount).toBe(1000);
  });
});

describe('splitEvenly', () => {
  it('平均分配目标金额', () => {
    const category = buildCategory([
      buildProduct({ productId: '1' }),
      buildProduct({ productId: '2' }),
      buildProduct({ productId: '3' }),
    ]);

    const result = splitEvenly(category, 900);

    expect(result[0].targetAmount).toBe(300);
    expect(result[1].targetAmount).toBe(300);
    expect(result[2].targetAmount).toBe(300);
  });

  it('空商品列表返回空数组', () => {
    const category = buildCategory([]);

    const result = splitEvenly(category, 1000);

    expect(result).toEqual([]);
  });

  it('不能整除时尾差补齐，总和 === targetAmount', () => {
    const category = buildCategory([
      buildProduct({ productId: '1' }),
      buildProduct({ productId: '2' }),
      buildProduct({ productId: '3' }),
    ]);

    const result = splitEvenly(category, 100);

    // 100 / 3 = 33.33 → 前两个 33，最后一个 34（尾差补齐）
    expect(result[0].targetAmount).toBe(33);
    expect(result[1].targetAmount).toBe(33);
    expect(result[2].targetAmount).toBe(34);
    expect(result.reduce((s, p) => s + p.targetAmount, 0)).toBe(100);
  });

  it('单品时全额分配', () => {
    const category = buildCategory([buildProduct({ productId: '1' })]);
    const result = splitEvenly(category, 100);
    expect(result[0].targetAmount).toBe(100);
  });

  it('splitByProportion 尾差补齐：100元拆3份', () => {
    const category = buildCategory([
      buildProduct({ productId: '1', actualAmountLastMonth: 1 }),
      buildProduct({ productId: '2', actualAmountLastMonth: 1 }),
      buildProduct({ productId: '3', actualAmountLastMonth: 1 }),
    ]);
    const result = splitByProportion(category, 100);
    // 各占 1/3，前两个 round(33.33) = 33，最后一个 = 100 - 66 = 34
    expect(result.reduce((s, p) => s + p.targetAmount, 0)).toBe(100);
  });

  it('splitByProportion 全零 fallback 到平均分后总和一致', () => {
    const category = buildCategory([
      buildProduct({ productId: '1', actualAmountLastMonth: 0 }),
      buildProduct({ productId: '2', actualAmountLastMonth: 0 }),
      buildProduct({ productId: '3', actualAmountLastMonth: 0 }),
    ]);
    const result = splitByProportion(category, 100);
    expect(result.reduce((s, p) => s + p.targetAmount, 0)).toBe(100);
  });
});

// =====================================================
// 通过 useTargetCalculation Hook 测试内部纯函数
// =====================================================

function buildCustomerTarget(overrides: Partial<CustomerTarget> = {}): CustomerTarget {
  return {
    customerId: 1,
    customerName: '客户A',
    isPlannedNew: false,
    marketerId: 100,
    marketerName: '张三',
    categories: [],
    ...overrides,
  };
}

describe('calcMomChange (via hook)', () => {
  it('previous=0 且 current>0 → 100', () => {
    const { result } = renderHook(() => useTargetCalculation());
    expect(result.current.getMomChange(50, 0)).toBe(100);
  });

  it('上月本月都 0 → 0', () => {
    const { result } = renderHook(() => useTargetCalculation());
    expect(result.current.getMomChange(0, 0)).toBe(0);
  });

  it('环比下降 → 负数', () => {
    const { result } = renderHook(() => useTargetCalculation());
    expect(result.current.getMomChange(80, 100)).toBe(-20);
  });
});

describe('aggregateCategory (via hook)', () => {
  it('从商品行求和 targetAmount/actualAmount', () => {
    const { result } = renderHook(() => useTargetCalculation());
    const category = buildCategory([
      buildProduct({ targetAmount: 100, actualAmountLastMonth: 50, actualAmountPrevMonth: 30 }),
      buildProduct({ targetAmount: 200, actualAmountLastMonth: 80, actualAmountPrevMonth: 40 }),
    ]);
    const agg = result.current.getCategoryAggregates(category);
    expect(agg.targetAmount).toBe(300);
    expect(agg.actualAmountLastMonth).toBe(130);
    expect(agg.actualAmountPrevMonth).toBe(70);
  });
});

describe('calcSummary (via hook)', () => {
  it('正确计算 coveredCustomers/coveredProducts/totalTargetAmount/fillProgress', () => {
    const { result } = renderHook(() => useTargetCalculation());
    const customers: CustomerTarget[] = [
      buildCustomerTarget({
        customerId: 1,
        categories: [buildCategory([
          buildProduct({ targetAmount: 100 }),
          buildProduct({ targetAmount: 0 }),
        ])],
      }),
      buildCustomerTarget({
        customerId: 2,
        categories: [buildCategory([
          buildProduct({ targetAmount: 0 }),
        ])],
      }),
    ];
    const summary = result.current.calculateSummary(customers);
    expect(summary.totalTargetAmount).toBe(100);
    expect(summary.coveredCustomers).toBe(1); // 只有客户1有目标
    expect(summary.coveredProducts).toBe(1);
    expect(summary.totalProducts).toBe(3);
    expect(summary.fillProgress).toBeCloseTo(33.33, 1);
  });

  it('空列表 → 零值', () => {
    const { result } = renderHook(() => useTargetCalculation());
    const summary = result.current.calculateSummary([]);
    expect(summary.totalTargetAmount).toBe(0);
    expect(summary.coveredProducts).toBe(0);
    expect(summary.fillProgress).toBe(0);
  });
});


