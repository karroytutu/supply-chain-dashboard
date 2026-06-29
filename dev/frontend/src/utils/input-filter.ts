/**
 * 输入过滤工具函数
 * @module utils/input-filter
 *
 * 提供金额/数字输入框的字符过滤能力，
 * 只允许数字和一个小数点，限制小数位和总长度。
 */

/** 金额输入最大字符数（10位整数 + 1小数点 + 2小数位 = 13） */
export const AMOUNT_MAX_LENGTH = 13;

/**
 * 过滤金额输入：只允许数字和一个小数点，最多两位小数
 * @param raw 原始输入字符串
 * @returns 过滤后的合法金额字符串
 */
export function filterNumberInput(raw: string): string {
  // 移除非数字和非小数点字符
  let filtered = raw.replace(/[^0-9.]/g, '');
  // 只保留第一个小数点
  const parts = filtered.split('.');
  if (parts.length > 2) {
    filtered = parts[0] + '.' + parts.slice(1).join('');
  }
  // 限制小数点后最多两位
  const dotIndex = filtered.indexOf('.');
  if (dotIndex !== -1 && filtered.length - dotIndex - 1 > 2) {
    filtered = filtered.slice(0, dotIndex + 3);
  }
  // 限制总长度
  if (filtered.length > AMOUNT_MAX_LENGTH) {
    filtered = filtered.slice(0, AMOUNT_MAX_LENGTH);
  }
  return filtered;
}
