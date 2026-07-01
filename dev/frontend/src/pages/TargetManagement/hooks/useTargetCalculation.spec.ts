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
    remark: '',
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

  it('不能整除时的舍入误差', () => {
    const category = buildCategory([
      buildProduct({ productId: '1' }),
      buildProduct({ productId: '2' }),
      buildProduct({ productId: '3' }),
    ]);

    const result = splitEvenly(category, 100);

    // 100 / 3 = 33.33 → Math.round = 33
    // 3 * 33 = 99（会损失 1，这是预期行为）
    expect(result[0].targetAmount).toBe(33);
    expect(result[1].targetAmount).toBe(33);
    expect(result[2].targetAmount).toBe(33);
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

describe('updateProductTarget (via hook)', () => {
  it('更新指定商品 targetAmount 不影响其他', () => {
    const { result } = renderHook(() => useTargetCalculation());
    const customers: CustomerTarget[] = [
      buildCustomerTarget({
        customerId: 1,
        categories: [buildCategory([
          buildProduct({ productId: '1', targetAmount: 100 }),
          buildProduct({ productId: '2', targetAmount: 200 }),
        ])],
      }),
    ];
    const updated = result.current.updateProductTarget(customers, 1, 'cat_1', '1', 'targetAmount', 500, 10);
    expect(updated[0].categories[0].products[0].targetAmount).toBe(500);
    expect(updated[0].categories[0].products[1].targetAmount).toBe(200); // 未变
  });
});

describe('addCustomers (via hook)', () => {
  it('去重已存在 customerId', () => {
    const { result } = renderHook(() => useTargetCalculation());
    const existing: CustomerTarget[] = [
      buildCustomerTarget({ customerId: 1 }),
    ];
    const updated = result.current.addCustomers(existing, [
      { customerId: 1, customerName: '客户A' }, // 已存在
      { customerId: 2, customerName: '客户B' }, // 新增
    ], 100, '张三');
    expect(updated).toHaveLength(2); // 原有1 + 新增1
    expect(updated[1].isPlannedNew).toBe(true);
  });
});

describe('addProductsToCustomer (via hook)', () => {
  it('已有品类追加', () => {
    const { result } = renderHook(() => useTargetCalculation());
    const customers: CustomerTarget[] = [
      buildCustomerTarget({
        customerId: 1,
        categories: [buildCategory([buildProduct({ productId: '1' })])],
      }),
    ];
    const updated = result.current.addProductsToCustomer(customers, 1, [
      { productId: '2', productName: '商品B', categoryId: 'cat_1', categoryName: '品类1', unit: '箱', unitPrice: 10 },
    ]);
    expect(updated[0].categories[0].products).toHaveLength(2);
  });

  it('新品类创建节点', () => {
    const { result } = renderHook(() => useTargetCalculation());
    const customers: CustomerTarget[] = [
      buildCustomerTarget({
        customerId: 1,
        categories: [buildCategory([buildProduct({ productId: '1' })])],
      }),
    ];
    const updated = result.current.addProductsToCustomer(customers, 1, [
      { productId: '3', productName: '商品C', categoryId: 'cat_2', categoryName: '新品类', unit: '瓶', unitPrice: 5 },
    ]);
    expect(updated[0].categories).toHaveLength(2);
    expect(updated[0].categories[1].categoryName).toBe('新品类');
  });

  it('productId 已存在跳过', () => {
    const { result } = renderHook(() => useTargetCalculation());
    const customers: CustomerTarget[] = [
      buildCustomerTarget({
        customerId: 1,
        categories: [buildCategory([buildProduct({ productId: '1' })])],
      }),
    ];
    const updated = result.current.addProductsToCustomer(customers, 1, [
      { productId: '1', productName: '商品A', categoryId: 'cat_1', categoryName: '品类1', unit: '箱', unitPrice: 10 },
    ]);
    expect(updated[0].categories[0].products).toHaveLength(1); // 未新增
  });
});
