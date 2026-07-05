/**
 * 格式化工具函数
 * @module utils/format
 */

import dayjs from 'dayjs';

/**
 * 格式化日期
 */
export function formatDate(date: string | Date | null | undefined, format = 'YYYY-MM-DD'): string {
  if (!date) return '-';
  return dayjs(date).format(format);
}

/**
 * 格式化日期时间
 */
export function formatDateTime(date: string | Date | null | undefined, format = 'YYYY-MM-DD HH:mm:ss'): string {
  if (!date) return '-';
  return dayjs(date).format(format);
}

/**
 * 格式化金额
 */
export function formatCurrency(
  value: number | string | null | undefined,
  options?: {
    prefix?: string;
    suffix?: string;
    precision?: number;
  }
): string {
  if (value === null || value === undefined || value === '') return '-';
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  
  const { prefix = '¥', suffix = '', precision = 2 } = options || {};
  
  const formatted = num.toLocaleString('zh-CN', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  
  return `${prefix}${formatted}${suffix}`;
}

/**
 * 格式化数字（千分位）
 */
export function formatNumber(
  value: number | string | null | undefined,
  precision?: number
): string {
  if (value === null || value === undefined || value === '') return '-';
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  
  const options: Intl.NumberFormatOptions = {
    style: 'decimal',
  };
  
  if (precision !== undefined) {
    options.minimumFractionDigits = precision;
    options.maximumFractionDigits = precision;
  }
  
  return num.toLocaleString('zh-CN', options);
}

/**
 * 格式化百分比
 */
export function formatPercent(
  value: number | string | null | undefined,
  precision = 2
): string {
  if (value === null || value === undefined || value === '') return '-';
  
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  
  return `${(num * 100).toFixed(precision)}%`;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '-';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * 紧凑金额格式化（万级缩写）
 * @param n 金额数值
 * @param options.zeroAs 值为0时的显示文本，默认 '-'
 * @example formatCompactAmount(0) => '-'
 * @example formatCompactAmount(123456) => '¥12.3万'
 * @example formatCompactAmount(5000) => '¥5,000'
 */
export function formatCompactAmount(
  n: number,
  options?: { zeroAs?: string }
): string {
  if (n === 0) return options?.zeroAs ?? '-';
  if (Math.abs(n) >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
  return `¥${n.toLocaleString()}`;
}

/**
 * 变化率格式化（环比/增长）
 * @param current 当前值
 * @param base 基准值
 * @returns { text, color } 文本和颜色
 */
export function formatChangeRate(
  current: number,
  base: number
): { text: string; color: string } {
  if (base === 0 && current === 0) return { text: '-', color: '#8c8c8c' };
  if (base === 0) return { text: '新增', color: '#52c41a' };
  const pct = ((current - base) / base) * 100;
  const arrow = pct >= 0 ? '↑' : '↓';
  const color = pct >= 0 ? '#52c41a' : '#ff4d4f';
  return { text: `${arrow}${Math.abs(pct).toFixed(1)}%`, color };
}

/**
 * 达成率格式化
 * @param actual 实际值
 * @param target 目标值
 * @returns 达成率字符串，如 '85.3%'
 */
export function formatAchievementRate(actual: number, target: number): string {
  if (target === 0) return '-';
  return `${((actual / target) * 100).toFixed(1)}%`;
}

/**
 * 增长率格式化（目标 vs 基线）
 * @param rate 增长率小数（如 0.15 = 15%）
 * @returns { text, sign } text 为格式化文本，sign 为 'positive' | 'negative' | ''
 */
export function formatGrowthRate(rate: number | null): { text: string; sign: 'positive' | 'negative' | '' } {
  if (rate === null) return { text: '-', sign: '' };
  const pct = (rate * 100).toFixed(1);
  if (rate > 0) return { text: `+${pct}%`, sign: 'positive' };
  if (rate < 0) return { text: `${pct}%`, sign: 'negative' };
  return { text: `${pct}%`, sign: '' };
}

/**
 * 相对时间格式化
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  
  const now = dayjs();
  const target = dayjs(date);
  const diffMinutes = now.diff(target, 'minute');
  const diffHours = now.diff(target, 'hour');
  const diffDays = now.diff(target, 'day');
  
  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  
  return target.format('YYYY-MM-DD');
}
