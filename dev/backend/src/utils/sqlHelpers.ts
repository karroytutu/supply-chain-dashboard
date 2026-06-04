/**
 * SQL LIKE/ILIKE 模式转义工具
 * 防止用户输入中的特殊字符（%, _, \）被解释为 LIKE 通配符
 * @module utils/sqlHelpers
 */

/**
 * 转义 LIKE/ILIKE pattern 中的特殊字符
 *
 * PostgreSQL 的 LIKE/ILIKE 默认使用 `\` 作为转义字符。
 * 本函数将用户输入中的 `\` → `\\`、`%` → `\%`、`_` → `\_`，
 * 使这些字符在 LIKE 匹配时被当作普通字符处理。
 *
 * 用法：将返回值直接传入参数化查询的 `$N` 占位符，无需额外添加 ESCAPE 子句。
 *
 * @example
 * ```typescript
 * const keyword = '%discount_50\\special';
 * const pattern = `%${escapeLikePattern(keyword)}%`;
 * // 生成: '%\%discount\_50\\special%'
 * // ILIKE 将精确匹配包含 "%discount_50\special" 的字符串
 * ```
 *
 * @param input - 用户输入的原始字符串
 * @returns 转义后的字符串，可安全用于 LIKE/ILIKE pattern
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
