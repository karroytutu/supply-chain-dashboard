/**
 * 环比计算工具单元测试
 * 测试 calculateTrend、formatTrendDisplay、formatDays、getTrendColor
 */

import { describe, it, expect } from 'vitest';
import { calculateTrend, formatTrendDisplay, formatDays, getTrendColor } from './calculation';

describe('calculateTrend', () => {
  it('上升', () => {
    const result = calculateTrend(150, 100);
    expect(result.direction).toBe('up');
    expect(result.percentage).toBe(50);
    expect(result.value).toBe(50);
  });

  it('下降', () => {
    const result = calculateTrend(80, 100);
    expect(result.direction).toBe('down');
    expect(result.percentage).toBe(-20);
    expect(result.value).toBe(20);
  });

  it('持平', () => {
    const result = calculateTrend(100, 100);
    expect(result.direction).toBe('flat');
    expect(result.percentage).toBe(0);
    expect(result.value).toBe(0);
  });

  it('前期为0', () => {
    const result = calculateTrend(50, 0);
    expect(result.direction).toBe('flat');
    expect(result.percentage).toBe(0);
  });

  it('百分比保留一位小数', () => {
    const result = calculateTrend(101, 100);
    expect(result.percentage).toBe(1);
  });
});

describe('formatTrendDisplay', () => {
  it('持平显示 — 0%', () => {
    const result = formatTrendDisplay(0, 'flat');
    expect(result.text).toContain('0%');
    expect(result.color).toBe('#8c8c8c');
    expect(result.isPositive).toBe(true);
  });

  it('上升 + 正向指标 → 绿色', () => {
    const result = formatTrendDisplay(5, 'up');
    expect(result.text).toBe('↑ 5%');
    expect(result.color).toBe('#52c41a');
    expect(result.isPositive).toBe(true);
  });

  it('上升 + 逆向指标 → 红色', () => {
    const result = formatTrendDisplay(5, 'up', true);
    expect(result.color).toBe('#ff4d4f');
    expect(result.isPositive).toBe(false);
  });

  it('下降 + 正向指标 → 红色', () => {
    const result = formatTrendDisplay(5, 'down');
    expect(result.text).toBe('↓ 5%');
    expect(result.color).toBe('#ff4d4f');
    expect(result.isPositive).toBe(false);
  });

  it('下降 + 逆向指标 → 绿色', () => {
    const result = formatTrendDisplay(5, 'down', true);
    expect(result.color).toBe('#52c41a');
    expect(result.isPositive).toBe(true);
  });
});

describe('formatDays', () => {
  it('基本格式化', () => {
    expect(formatDays(7)).toBe('7天');
    expect(formatDays(0)).toBe('0天');
    expect(formatDays(365)).toBe('365天');
  });
});

describe('getTrendColor', () => {
  it('持平 → 灰色', () => {
    expect(getTrendColor('flat')).toBe('#8c8c8c');
  });

  it('上升 + 正向 → 绿色', () => {
    expect(getTrendColor('up')).toBe('#52c41a');
  });

  it('上升 + 逆向 → 红色', () => {
    expect(getTrendColor('up', true)).toBe('#ff4d4f');
  });

  it('下降 + 逆向 → 绿色', () => {
    expect(getTrendColor('down', true)).toBe('#52c41a');
  });
});
