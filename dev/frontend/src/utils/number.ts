/**
 * 数字工具函数
 */

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const UNITS = ['', '拾', '佰', '仟'];
const LARGE_UNITS = ['', '万', '亿', '兆'];

/**
 * 数字转中文大写金额
 */
export function numberToChineseUpper(n: number): string {
  if (n === 0) return '零元整';
  if (n < 0) return '负' + numberToChineseUpper(-n);

  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);

  let result = '';

  // 整数部分
  if (intPart > 0) {
    const intStr = intPart.toString();
    const len = intStr.length;
    let zeroFlag = false;

    for (let i = 0; i < len; i++) {
      const digit = parseInt(intStr[i], 10);
      const pos = len - 1 - i;
      const unitPos = pos % 4;
      const largeUnitPos = Math.floor(pos / 4);

      if (digit === 0) {
        zeroFlag = true;
        if (unitPos === 0 && largeUnitPos > 0) {
          result += LARGE_UNITS[largeUnitPos];
        }
      } else {
        if (zeroFlag) {
          result += '零';
          zeroFlag = false;
        }
        result += DIGITS[digit] + UNITS[unitPos];
        if (unitPos === 0 && largeUnitPos > 0) {
          result += LARGE_UNITS[largeUnitPos];
        }
      }
    }

    result += '元';
  }

  // 小数部分
  if (decPart > 0) {
    const jiao = Math.floor(decPart / 10);
    const fen = decPart % 10;

    if (jiao > 0) {
      result += DIGITS[jiao] + '角';
    }
    if (fen > 0) {
      result += DIGITS[fen] + '分';
    }
  } else {
    result += '整';
  }

  return result;
}

/**
 * 格式化金额（添加千分位）
 */
export function formatMoney(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}
