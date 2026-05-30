/**
 * 日期格式化工具函数
 * 统一处理 PostgreSQL DATE 类型返回的 Date 对象与字符串的兼容问题
 * @module utils/dateFormat
 */

/**
 * 将 Date 对象或日期字符串统一转为 YYYY-MM-DD 格式
 *
 * PostgreSQL DATE 类型在 node-postgres 中可能返回 Date 对象或字符串，
 * 此函数统一处理两种情况，避免各业务文件重复编写 instanceof 判断。
 *
 * @param value - Date 对象、日期字符串或其他可转为字符串的值
 * @returns YYYY-MM-DD 格式的日期字符串
 */
export function formatDateOnly(value: Date | string | unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

/**
 * 将 Date 对象或日期时间字符串统一转为 ISO 8601 完整格式
 *
 * @param value - Date 对象、ISO 字符串或其他可转为字符串的值
 * @returns ISO 8601 格式的日期时间字符串
 */
export function formatDateTime(value: Date | string | unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}
