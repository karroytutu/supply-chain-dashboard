/**
 * 输入过滤工具函数
 * @module utils/input-filter
 *
 * 提供金额/数字输入框的字符过滤能力，
 * 只允许数字和一个小数点，限制小数位和总长度。
 * 支持可选负号（退货应付单等场景）。
 */

/** 金额输入最大字符数（10位整数 + 1小数点 + 2小数位 = 13） */
export const AMOUNT_MAX_LENGTH = 13;

/**
 * 过滤金额输入：只允许数字和一个小数点，最多两位小数
 * @param raw 原始输入字符串
 * @param allowNegative 是否允许负号（默认 false，向后兼容）
 * @returns 过滤后的合法金额字符串
 */
export function filterNumberInput(raw: string, allowNegative = false): string {
  // 提取前导负号（仅 allowNegative=true 时保留）
  let negative = '';
  if (allowNegative && raw.startsWith('-')) {
    negative = '-';
    raw = raw.slice(1);
  }
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
  // 限制总长度（负号占一位）
  const maxLen = negative ? AMOUNT_MAX_LENGTH - 1 : AMOUNT_MAX_LENGTH;
  if (filtered.length > maxLen) {
    filtered = filtered.slice(0, maxLen);
  }
  return negative + filtered;
}
