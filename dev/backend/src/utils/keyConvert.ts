/**
 * 键名转换工具
 * 提供 snake_case ↔ camelCase 的双向递归转换
 * 用于系统边界的 DTO 映射：控制器层（响应出/请求入）
 */

/**
 * 单个键名：snake_case → camelCase
 */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * 单个键名：camelCase → snake_case
 */
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * 递归转换对象所有键名为 camelCase
 * Date / null / undefined / 基本类型直接透传
 */
export function toCamelKeys<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => toCamelKeys(item)) as T;
  }
  if (typeof obj !== 'object') return obj;

  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    result[toCamelCase(key)] = toCamelKeys((obj as Record<string, any>)[key]);
  }
  return result as T;
}

/**
 * 递归转换对象所有键名为 snake_case
 * Date / null / undefined / 基本类型直接透传
 */
export function toSnakeKeys<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => toSnakeKeys(item)) as T;
  }
  if (typeof obj !== 'object') return obj;

  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    result[toSnakeCase(key)] = toSnakeKeys((obj as Record<string, any>)[key]);
  }
  return result as T;
}
