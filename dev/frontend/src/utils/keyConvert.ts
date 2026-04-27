/**
 * 键名转换工具
 * 用于前端 API 层的 camelCase ↔ snake_case 自动转换
 */

/** camelCase 字符串转 snake_case */
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/** 递归将对象所有键名从 camelCase 转为 snake_case */
export function toSnakeKeys<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(item => toSnakeKeys(item)) as T;
  if (typeof obj !== 'object') return obj;
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    result[toSnakeCase(key)] = toSnakeKeys((obj as Record<string, any>)[key]);
  }
  return result as T;
}

/** 递归将对象所有键名从 snake_case 转为 camelCase */
export function toCamelKeys<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(item => toCamelKeys(item)) as T;
  if (typeof obj !== 'object') return obj;
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    result[camelKey] = toCamelKeys((obj as Record<string, any>)[key]);
  }
  return result as T;
}
