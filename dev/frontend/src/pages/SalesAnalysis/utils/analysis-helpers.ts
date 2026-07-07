/**
 * 销售分析通用工具函数
 * 中位数、四象限分类、动销率、集中度计算
 */

import type { QuadrantKey } from '@/types/sales-analysis';

/**
 * 计算数组的中位数
 * @param values 数值数组
 * @returns 中位数，空数组返回 0
 */
export function calcMedian(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * 根据双维度值和中位数阈值，计算四象限分类
 * @param primaryValue 主维度值（如销售额）
 * @param secondaryValue 副维度值（如毛利）
 * @param primaryMedian 主维度中位数
 * @param secondaryMedian 副维度中位数
 * @returns 象限标识
 */
export function classifyQuadrant(
  primaryValue: number,
  secondaryValue: number,
  primaryMedian: number,
  secondaryMedian: number,
): QuadrantKey {
  const highPrimary = primaryValue >= primaryMedian;
  const highSecondary = secondaryValue >= secondaryMedian;
  if (highPrimary && highSecondary) return 'star';
  if (highPrimary && !highSecondary) return 'traffic';
  if (!highPrimary && highSecondary) return 'potential';
  return 'problem';
}

/**
 * 计算动销率
 * @param totalSKU 总 SKU 数
 * @param activeSKU 有销售的 SKU 数
 * @returns 动销率（0-1），totalSKU 为 0 时返回 0
 */
export function calcTurnoverRate(totalSKU: number, activeSKU: number): number {
  if (totalSKU <= 0) return 0;
  return Math.min(activeSKU / totalSKU, 1);
}

/**
 * 计算 Top N 集中度
 * @param sortedValues 已降序排列的数值数组
 * @param n 取前 N 个
 * @returns 前 N 个占总和的百分比（0-100），总和为 0 返回 0
 */
export function calcConcentration(sortedValues: number[], n: number): number {
  const total = sortedValues.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  const topN = sortedValues.slice(0, n).reduce((s, v) => s + v, 0);
  return Math.round((topN / total) * 10000) / 100;
}

/**
 * 格式化金额（紧凑显示）
 * @param value 金额值
 * @returns 格式化字符串（如 "12.8万"）
 */
export function formatCompactAmount(value: number): string {
  if (Math.abs(value) >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}千`;
  }
  return value.toLocaleString();
}
