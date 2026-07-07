/**
 * 销售分析工具函数单元测试
 */
import { describe, it, expect } from 'vitest';
import {
  calcMedian,
  classifyQuadrant,
  calcTurnoverRate,
  calcConcentration,
  formatCompactAmount,
} from '../../utils/analysis-helpers';

// =====================================================
// calcMedian
// =====================================================
describe('calcMedian', () => {
  it('奇数长度数组', () => {
    expect(calcMedian([3, 1, 2])).toBe(2);
    expect(calcMedian([5])).toBe(5);
  });

  it('偶数长度数组取中间两值的平均', () => {
    expect(calcMedian([1, 2, 3, 4])).toBe(2.5);
    expect(calcMedian([10, 20])).toBe(15);
  });

  it('单元素数组', () => {
    expect(calcMedian([42])).toBe(42);
  });

  it('空数组返回 0', () => {
    expect(calcMedian([])).toBe(0);
  });

  it('不修改原数组', () => {
    const original = [5, 3, 1];
    calcMedian(original);
    expect(original).toEqual([5, 3, 1]);
  });
});

// =====================================================
// classifyQuadrant
// =====================================================
describe('classifyQuadrant', () => {
  const pMed = 100;
  const sMed = 50;

  it('双高 -> star', () => {
    expect(classifyQuadrant(150, 80, pMed, sMed)).toBe('star');
  });

  it('主高副低 -> traffic', () => {
    expect(classifyQuadrant(150, 30, pMed, sMed)).toBe('traffic');
  });

  it('主低副高 -> potential', () => {
    expect(classifyQuadrant(50, 80, pMed, sMed)).toBe('potential');
  });

  it('双低 -> problem', () => {
    expect(classifyQuadrant(50, 30, pMed, sMed)).toBe('problem');
  });

  it('恰好等于中位数归入高', () => {
    expect(classifyQuadrant(100, 50, pMed, sMed)).toBe('star');
    expect(classifyQuadrant(100, 49, pMed, sMed)).toBe('traffic');
    expect(classifyQuadrant(99, 50, pMed, sMed)).toBe('potential');
    expect(classifyQuadrant(99, 49, pMed, sMed)).toBe('problem');
  });
});

// =====================================================
// calcTurnoverRate
// =====================================================
describe('calcTurnoverRate', () => {
  it('全部有销售', () => {
    expect(calcTurnoverRate(100, 100)).toBe(1);
  });

  it('部分有销售', () => {
    expect(calcTurnoverRate(100, 78)).toBe(0.78);
  });

  it('全部无销售', () => {
    expect(calcTurnoverRate(100, 0)).toBe(0);
  });

  it('总数为 0 返回 0', () => {
    expect(calcTurnoverRate(0, 0)).toBe(0);
  });

  it('activeSKU 超过 totalSKU 时上限为 1', () => {
    expect(calcTurnoverRate(10, 15)).toBe(1);
  });
});

// =====================================================
// calcConcentration
// =====================================================
describe('calcConcentration', () => {
  it('Top 5 占比计算', () => {
    const values = [40, 30, 20, 5, 3, 2]; // sum = 100, top5 = 98
    expect(calcConcentration(values, 5)).toBe(98);
  });

  it('Top 10 占比计算（数据不足 10 个）', () => {
    const values = [60, 40]; // sum = 100
    expect(calcConcentration(values, 10)).toBe(100);
  });

  it('总和为 0 返回 0', () => {
    expect(calcConcentration([0, 0, 0], 2)).toBe(0);
  });

  it('空数组返回 0', () => {
    expect(calcConcentration([], 5)).toBe(0);
  });
});

// =====================================================
// formatCompactAmount
// =====================================================
describe('formatCompactAmount', () => {
  it('万级显示', () => {
    expect(formatCompactAmount(128000)).toBe('12.8万');
    expect(formatCompactAmount(10000)).toBe('1.0万');
  });

  it('千级显示', () => {
    expect(formatCompactAmount(5600)).toBe('5.6千');
    expect(formatCompactAmount(1000)).toBe('1.0千');
  });

  it('小于千的数值直接显示', () => {
    expect(formatCompactAmount(999)).toBe('999');
    expect(formatCompactAmount(0)).toBe('0');
  });
});
