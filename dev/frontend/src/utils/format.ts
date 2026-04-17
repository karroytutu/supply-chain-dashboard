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
