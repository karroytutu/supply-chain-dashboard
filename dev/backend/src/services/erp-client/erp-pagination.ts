/**
 * 并行分页拉取辅助
 * 先请求第一页获取 total，再并行请求剩余页（受分组限流器约束）
 * @module services/erp-client/erp-pagination
 */

/** 单页结果 */
export interface PageResult<T> {
  records: T[];
  total: number;
}

/**
 * 并行拉取全部分页数据
 *
 * 策略：先串行请求第一页以获取 total，再并行请求剩余页。
 * 并行度由 erp-rate-limiter 的分组信号量自然约束，无需额外并发控制。
 *
 * @param fetchPage    获取指定页码(1-based)的回调，返回 records + total
 * @param pageSize     每页条数（用于计算总页数）
 * @param maxParallel  可选：剩余页最大批次并发(默认不限，交由限流器控制)
 * @returns 所有页的记录，按页码顺序拼接
 */
export async function fetchAllPagesParallel<T>(
  fetchPage: (current: number) => Promise<PageResult<T>>,
  pageSize: number,
  maxParallel?: number
): Promise<T[]> {
  // 第一页：串行，用于获取 total
  const first = await fetchPage(1);
  const total = first.total || first.records.length;

  // 只有一页或第一页已包含全部数据
  if (first.records.length >= total || first.records.length < pageSize) {
    return first.records;
  }

  const totalPages = Math.ceil(total / pageSize);
  const restPageNums = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

  const runBatch = (pages: number[]): Promise<T[][]> =>
    Promise.all(pages.map(p => fetchPage(p).then(r => r.records)));

  let restResults: T[][];

  if (maxParallel && maxParallel > 0 && restPageNums.length > maxParallel) {
    // 分批并行：每批 maxParallel 页
    restResults = [];
    for (let i = 0; i < restPageNums.length; i += maxParallel) {
      const batch = restPageNums.slice(i, i + maxParallel);
      restResults.push(...(await runBatch(batch)));
    }
  } else {
    // 全部并行（由限流器约束实际并发数）
    restResults = await runBatch(restPageNums);
  }

  return [...first.records, ...restResults.flat()];
}
