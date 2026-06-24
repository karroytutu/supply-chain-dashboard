/**
 * 北京时间工具函数
 *
 * 服务器运行时区可能为 UTC，但业务日期需要北京时间 (Asia/Shanghai, UTC+8)。
 * 凌晨 0:00~8:00 之间 new Date().toISOString() 会返回前一天的 UTC 日期，
 * 本模块统一提供北京时间感知的日期/时间生成函数，避免时区偏差。
 *
 * @module utils/beijingTime
 */

const BEIJING_TZ = 'Asia/Shanghai';

/**
 * 获取当前北京时间的日期时间字符串
 * @returns YYYY-MM-DD HH:mm:ss 格式
 */
export function beijingDateTime(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: BEIJING_TZ });
}

/**
 * 获取当前北京时间的日期字符串
 * @returns YYYY-MM-DD 格式
 */
export function beijingDate(): string {
  return beijingDateTime().slice(0, 10);
}

/**
 * 获取当前北京时间的紧凑日期字符串（用于编号生成）
 * @returns YYYYMMDD 格式
 */
export function beijingDateCompact(): string {
  return beijingDate().replace(/-/g, '');
}

/**
 * 获取相对北京时间今天偏移 N 天的日期字符串
 *
 * 使用 Intl.DateTimeFormat 提取北京时间的日期分量，避免 UTC 日期边界问题。
 *
 * @param daysOffset - 偏移天数，正数为未来，负数为过去
 * @returns YYYY-MM-DD 格式
 */
export function beijingDateOffset(daysOffset: number): string {
  const now = new Date();
  const bjParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BEIJING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: string) => bjParts.find(p => p.type === type)!.value;
  const bjToday = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00`);
  bjToday.setDate(bjToday.getDate() + daysOffset);

  const y = bjToday.getFullYear();
  const m = String(bjToday.getMonth() + 1).padStart(2, '0');
  const d = String(bjToday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 将任意 Date 对象格式化为 YYYY-MM-DD（使用本地时间分量）
 *
 * 避免 toISOString() 的 UTC 偏移导致日期错位。
 * 适用于基于业务日期计算后的 Date 对象（如逾期日期、到期日期）。
 *
 * @param date - 待格式化的 Date 对象
 * @returns YYYY-MM-DD 格式
 */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
