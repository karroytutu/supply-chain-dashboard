/**
 * computeFeeTotals 费用计算工具 测试
 */

import { describe, it, expect } from 'vitest';
import { computeFeeTotals } from './computeFeeTotals';

describe('computeFeeTotals', () => {
  it('空输入返回 total=0', () => {
    expect(computeFeeTotals(undefined)).toEqual({ total: 0, updatedLines: [] });
    expect(computeFeeTotals([])).toEqual({ total: 0, updatedLines: [] });
  });

  it('正常计算：单价 × 数量 = 金额', () => {
    const result = computeFeeTotals([
      { feeUnitPrice: 10, quantity: 5 },
      { feeUnitPrice: 20, quantity: 3 },
    ]);
    expect(result.updatedLines[0].feeAmount).toBe(50);
    expect(result.updatedLines[1].feeAmount).toBe(60);
    expect(result.total).toBe(110);
  });

  it('清空单价时 feeAmount 为 null（不保留旧值）', () => {
    const result = computeFeeTotals([
      { feeUnitPrice: null, quantity: 5, feeAmount: 50 }, // 旧值 50 应被清除
    ]);
    expect(result.updatedLines[0].feeAmount).toBeNull();
    expect(result.total).toBe(0);
  });

  it('单价为 0 时 feeAmount 为 null', () => {
    const result = computeFeeTotals([
      { feeUnitPrice: 0, quantity: 5, feeAmount: 999 }, // 旧值应被清除
    ]);
    expect(result.updatedLines[0].feeAmount).toBeNull();
    expect(result.total).toBe(0);
  });

  it('数量为 0 时 feeAmount 为 null', () => {
    const result = computeFeeTotals([
      { feeUnitPrice: 10, quantity: 0 },
    ]);
    expect(result.updatedLines[0].feeAmount).toBeNull();
    expect(result.total).toBe(0);
  });

  it('单价为空字符串时 feeAmount 为 null', () => {
    const result = computeFeeTotals([
      { feeUnitPrice: '', quantity: 5 },
    ]);
    expect(result.updatedLines[0].feeAmount).toBeNull();
    expect(result.total).toBe(0);
  });

  it('浮点精度：0.1 × 3 = 0.3（非 0.30000000000000004）', () => {
    const result = computeFeeTotals([
      { feeUnitPrice: 0.1, quantity: 3 },
    ]);
    expect(result.updatedLines[0].feeAmount).toBe(0.3);
    expect(result.total).toBe(0.3);
  });

  it('浮点精度：33.33 × 3 = 99.99', () => {
    const result = computeFeeTotals([
      { feeUnitPrice: 33.33, quantity: 3 },
    ]);
    expect(result.updatedLines[0].feeAmount).toBe(99.99);
    expect(result.total).toBe(99.99);
  });

  it('多行浮点累加无偏差', () => {
    const result = computeFeeTotals([
      { feeUnitPrice: 0.1, quantity: 1 },
      { feeUnitPrice: 0.2, quantity: 1 },
      { feeUnitPrice: 0.3, quantity: 1 },
    ]);
    expect(result.total).toBe(0.6);
  });

  it('保留行内其他字段', () => {
    const result = computeFeeTotals([
      { feeUnitPrice: 10, quantity: 2, goodsName: '商品A', billOrderStr: 'PO001' },
    ]);
    expect(result.updatedLines[0].goodsName).toBe('商品A');
    expect(result.updatedLines[0].billOrderStr).toBe('PO001');
    expect(result.updatedLines[0].feeAmount).toBe(20);
  });
});
