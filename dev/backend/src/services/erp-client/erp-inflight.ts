/**
 * In-flight 请求去重工具
 * 相同 key 的并发调用共享同一 Promise，避免重复 ERP 请求
 * @module services/erp-client/erp-inflight
 */

/** 全局 in-flight Promise 存储 */
const _inFlightMap = new Map<string, Promise<unknown>>();

/**
 * In-flight 去重包装器
 *
 * 相同 key 的并发调用共享同一 Promise。
 * Promise settle 后自动从 Map 中删除，后续调用重新发起请求。
 *
 * @param key - 去重键（如 'erp:products:all'、'erp:debts:all'）
 * @param fn - 实际的数据获取函数
 * @returns 共享的 Promise 结果
 *
 * @example
 * ```ts
 * // 多个并发调用只触发一次 ERP 请求
 * const products = await withInFlightDedup('erp:products:all', () => fetchAllProductsFromErp());
 * ```
 */
export async function withInFlightDedup<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const existing = _inFlightMap.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fn().finally(() => {
    // settle 后自动清理（仅当 Map 中仍是同一个 Promise 时）
    if (_inFlightMap.get(key) === promise) {
      _inFlightMap.delete(key);
    }
  });

  _inFlightMap.set(key, promise);
  return promise;
}

/**
 * 基于参数的 in-flight 去重包装器
 *
 * 自动根据参数生成去重键，适用于参数化查询的去重。
 *
 * @param prefix - 去重键前缀（如 'erp:daily-sales'）
 * @param keyFn - 从参数生成去重键的函数
 * @param fn - 实际的数据获取函数
 *
 * @example
 * ```ts
 * const data = await withInFlightDedupByKey(
 *   'erp:daily-sales',
 *   (goodsIds: number[]) => goodsIds.sort().join(','),
 *   (goodsIds) => fetchDailySales(goodsIds)
 * )(sortedGoodsIds);
 * ```
 */
export function withInFlightDedupByKey<Args extends unknown[], T>(
  prefix: string,
  keyFn: (...args: Args) => string,
  fn: (...args: Args) => Promise<T>
): (...args: Args) => Promise<T> {
  return (...args: Args): Promise<T> => {
    const key = `${prefix}:${keyFn(...args)}`;
    return withInFlightDedup(key, () => fn(...args));
  };
}
