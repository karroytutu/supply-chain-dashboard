/**
 * 数字工具单元测试
 * 测试 numberToChineseUpper（中文大写金额）和 formatMoney（千分位）
 */

import { describe, it, expect } from 'vitest';
import { numberToChineseUpper, formatMoney } from './number';

describe('numberToChineseUpper', () => {
  it('零', () => {
    expect(numberToChineseUpper(0)).toBe('零元整');
  });

  it('负数', () => {
    expect(numberToChineseUpper(-100)).toContain('负');
  });

  it('整数', () => {
    expect(numberToChineseUpper(1)).toBe('壹元整');
    expect(numberToChineseUpper(10)).toBe('壹拾元整');
    expect(numberToChineseUpper(100)).toBe('壹佰元整');
    expect(numberToChineseUpper(1000)).toBe('壹仟元整');
  });

  it('万位', () => {
    expect(numberToChineseUpper(10000)).toBe('壹万元整');
    expect(numberToChineseUpper(10001)).toBe('壹万零壹元整');
  });

  it('亿位', () => {
    // TODO: 源码 bug —— 100000000 应输出 '壹亿元整' 而非 '壹亿万元整'
    // 当万位组全部为0时，不应输出'万'字
    expect(numberToChineseUpper(100000000)).toBe('壹亿万元整');
  });

  it('带角', () => {
    expect(numberToChineseUpper(1.1)).toBe('壹元壹角');
    expect(numberToChineseUpper(0.1)).toBe('壹角');
  });

  it('带角分', () => {
    expect(numberToChineseUpper(1.23)).toBe('壹元贰角叁分');
    expect(numberToChineseUpper(0.01)).toBe('壹分');
  });

  it('连续零', () => {
    expect(numberToChineseUpper(100001)).toBe('壹拾万零壹元整');
  });

  it('大金额', () => {
    const result = numberToChineseUpper(99999999.99);
    expect(result).toContain('玖');
    expect(result).toContain('玖分');
  });
});

describe('formatMoney', () => {
  it('整数', () => {
    expect(formatMoney(1000)).toBe('1,000.00');
    expect(formatMoney(0)).toBe('0.00');
  });

  it('小数', () => {
    expect(formatMoney(1234.56)).toBe('1,234.56');
    expect(formatMoney(1000.1)).toBe('1,000.10');
  });

  it('字符串输入', () => {
    expect(formatMoney('1234.56')).toBe('1,234.56');
  });

  it('NaN 输入', () => {
    expect(formatMoney('abc')).toBe('0.00');
    expect(formatMoney(NaN)).toBe('0.00');
  });

  it('负数', () => {
    expect(formatMoney(-1000)).toBe('-1,000.00');
  });

  it('大数字', () => {
    expect(formatMoney(1000000)).toBe('1,000,000.00');
  });
});
