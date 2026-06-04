/**
 * 数据库通用类型
 * 用于替代 SQL 参数和查询结果中的 any 类型
 */

/** SQL 查询参数类型 */
export type SqlParam = string | number | boolean | null | Date | undefined;
