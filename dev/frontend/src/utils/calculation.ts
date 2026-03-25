import type { TrendDirection, TrendResult } from '../types/dashboard';

/**
 * 计算环比变化
 * @param current 当前值
 * @param previous 上期值
 * @returns 趋势结果
 */
export const calculateTrend = (current: number, previous: number): TrendResult => {
  if (previous === 0) {
    return { value: 0, direction: 'flat', percentage: 0 };
  }

  const change = current - previous;
  const percentage = parseFloat(((change / previous) * 100).toFixed(1));
  const direction: TrendDirection = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

  return {
    value: Math.abs(change),
    direction,
    percentage,
  };
};

/**
 * 格式化环比展示
 * @param trend 趋势值
 * @param direction 趋势方向
 * @param isInverseMetric 是否为逆向指标（如周转天数，下降是好事）
 */
export const formatTrendDisplay = (
  trend: number,
  direction: TrendDirection,
  isInverseMetric?: boolean,
): { text: string; color: string; isPositive: boolean } => {
  if (direction === 'flat') {
    return { text: '— 0%', color: '#8c8c8c', isPositive: true };
  }

  const arrow = direction === 'up' ? '↑' : '↓';
  const isPositive = isInverseMetric ? direction === 'down' : direction === 'up';
  const color = isPositive ? '#52c41a' : '#ff4d4f';

  return {
    text: `${arrow} ${trend}%`,
    color,
    isPositive,
  };
};

/**
 * 格式化百分比
 * @param value 数值
 * @param decimals 小数位数
 */
export const formatPercent = (value: number, decimals: number = 1): string => {
  return `${value.toFixed(decimals)}%`;
};

/**
 * 格式化数字（添加千分位）
 * @param value 数值
 */
export const formatNumber = (value: number): string => {
  return value.toLocaleString('zh-CN');
};

/**
 * 格式化天数
 * @param days 天数
 */
export const formatDays = (days: number): string => {
  return `${days}天`;
};

/**
 * 获取趋势颜色
 * @param direction 趋势方向
 * @param isInverseMetric 是否为逆向指标
 */
export const getTrendColor = (direction: TrendDirection, isInverseMetric?: boolean): string => {
  if (direction === 'flat') return '#8c8c8c';

  const isPositive = isInverseMetric ? direction === 'down' : direction === 'up';
  return isPositive ? '#52c41a' : '#ff4d4f';
};
