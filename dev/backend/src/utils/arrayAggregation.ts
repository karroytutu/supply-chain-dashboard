/**
 * 数组聚合工具函数
 * 替代 SQL 中的 GROUP BY / SUM / COUNT / LEFT JOIN / 分页等操作
 * @module utils/arrayAggregation
 */

/**
 * 按指定 key 分组
 * 替代 SQL GROUP BY
 */
export function groupBy<T>(array: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of array) {
    const key = keyFn(item);
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

/**
 * 按指定字段求和
 * 替代 SQL SUM()
 */
export function sumBy<T>(array: T[], valueFn: (item: T) => number): number {
  let total = 0;
  for (const item of array) {
    total += valueFn(item);
  }
  return total;
}

/**
 * 按条件计数
 * 替代 SQL COUNT(CASE WHEN ...)
 */
export function countBy<T>(array: T[], predicate: (item: T) => boolean): number {
  let count = 0;
  for (const item of array) {
    if (predicate(item)) count++;
  }
  return count;
}

/**
 * 按指定字段求最大值
 * 替代 SQL MAX()
 */
export function maxBy<T>(array: T[], valueFn: (item: T) => number): T | undefined {
  let maxItem: T | undefined;
  let maxVal = -Infinity;
  for (const item of array) {
    const val = valueFn(item);
    if (val > maxVal) {
      maxVal = val;
      maxItem = item;
    }
  }
  return maxItem;
}

/**
 * 内存 LEFT JOIN
 * 替代 SQL LEFT JOIN ... ON ...
 *
 * @param left 左表数据
 * @param right 右表数据
 * @param leftKey 左表关联 key
 * @param rightKey 右表关联 key
 * @returns 合并后的数组，右表字段以 rightPrefix 为前缀
 */
export function leftJoin<L, R>(
  left: L[],
  right: R[],
  leftKey: (item: L) => string,
  rightKey: (item: R) => string
): Map<string, { left: L; rights: R[] }> {
  // 先建立右表索引
  const rightIndex = new Map<string, R[]>();
  for (const r of right) {
    const key = rightKey(r);
    const existing = rightIndex.get(key);
    if (existing) {
      existing.push(r);
    } else {
      rightIndex.set(key, [r]);
    }
  }

  // 遍历左表做 JOIN
  const result = new Map<string, { left: L; rights: R[] }>();
  for (const l of left) {
    const key = leftKey(l);
    const rights = rightIndex.get(key) || [];
    result.set(key, { left: l, rights });
  }

  return result;
}

/**
 * 内存分页 + 过滤
 * 替代 SQL WHERE ... LIMIT ... OFFSET ...
 */
export function filterAndPaginate<T>(
  array: T[],
  predicate: (item: T) => boolean,
  page: number,
  pageSize: number
): { data: T[]; total: number; page: number; pageSize: number } {
  const filtered = array.filter(predicate);
  const total = filtered.length;
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 100);
  const start = (safePage - 1) * safePageSize;
  const data = filtered.slice(start, start + safePageSize);

  return { data, total, page: safePage, pageSize: safePageSize };
}

/**
 * 构建按 key 聚合的 Map（SUM）
 * 替代 SQL SELECT key, SUM(value) GROUP BY key
 */
export function aggregateSum<T>(
  array: T[],
  keyFn: (item: T) => string,
  valueFn: (item: T) => number
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of array) {
    const key = keyFn(item);
    const val = valueFn(item);
    map.set(key, (map.get(key) || 0) + val);
  }
  return map;
}

/**
 * 构建按 key 的最后一项 Map
 * 替代 SQL SELECT key, MAX(date) GROUP BY key
 */
export function lastBy<T>(
  array: T[],
  keyFn: (item: T) => string,
  compareFn: (item: T) => number | string
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of array) {
    const key = keyFn(item);
    const existing = map.get(key);
    if (!existing || compareFn(item) > compareFn(existing)) {
      map.set(key, item);
    }
  }
  return map;
}

// ==================== 品类路径解析 ====================

/** 未分类商品的默认品类名称 */
const UNCATEGORIZED = '未分类';

/**
 * 从品类链路径中提取指定层级的路径
 *
 * 品类链格式示例: "食品/零食/坚果"
 * - level=0 → "食品"（仅 L1 名称）
 * - level=1 → "食品/零食"（L1/L2 路径）
 * - level=2 → "食品/零食/坚果"（L1/L2/L3 完整路径）
 *
 * @param chainName - 品类链路径字符串（如 "食品/零食/坚果"），可为 null/undefined
 * @param level - 目标层级（0=L1, 1=L2, 2=L3），默认 0
 * @returns 截断到目标层级的路径，层级不足时返回实际可用部分；chainName 为空时返回 '未分类'
 */
export function getCategoryLevel(chainName: string | undefined | null, level = 0): string {
  if (!chainName) return UNCATEGORIZED;
  const parts = chainName.split('/');
  if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) {
    return UNCATEGORIZED;
  }
  return parts.slice(0, level + 1).join('/') || UNCATEGORIZED;
}

/**
 * 从品类链路径中提取一级品类名称（L1）
 * 等价于 getCategoryLevel(chainName, 0)
 *
 * @param chainName - 品类链路径字符串
 * @returns L1 品类名称，为空时返回 '未分类'
 */
export function getCategoryName(chainName: string | undefined | null): string {
  return getCategoryLevel(chainName, 0);
}
