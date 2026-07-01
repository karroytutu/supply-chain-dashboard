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

/**
 * 带完整性校验的并行分页拉取
 *
 * 策略：先并行拉取，然后对比 API 返回的 total 与实际记录数。
 * 如果不一致（并发导致页间数据偏移），自动降级为串行重拉。
 * 保障数据完整性同时不牺牲正常场景的效率。
 *
 * @param fetchPage  获取指定页码(1-based)的回调
 * @param pageSize   每页条数
 * @param logLabel    日志标签（用于降级时输出警告）
 * @returns 所有页的记录 + API 返回的 knownTotal
 */
export async function fetchAllPagesVerified<T>(
  fetchPage: (current: number) => Promise<PageResult<T>>,
  pageSize: number,
  logLabel?: string
): Promise<{ records: T[]; knownTotal: number }> {
  // 第一页：串行，获取 total
  const first = await fetchPage(1);
  const knownTotal = first.total || first.records.length;

  if (first.records.length >= knownTotal || first.records.length < pageSize) {
    return { records: first.records, knownTotal };
  }

  // 并行拉取剩余页
  const totalPages = Math.ceil(knownTotal / pageSize);
  const restPageNums = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  const restResults = await Promise.all(restPageNums.map(p => fetchPage(p).then(r => r.records)));
  const allRecords = [...first.records, ...restResults.flat()];

  // 校验完整性
  if (knownTotal > 0 && allRecords.length !== knownTotal) {
    const label = logLabel ?? 'unknown';
    console.warn(`[fetchAllPagesVerified] ${label}: 数据不完整 (${allRecords.length}/${knownTotal})，降级串行重拉`);
    const sequentialRecords = await fetchAllPagesSequential(fetchPage, pageSize);
    return { records: sequentialRecords, knownTotal };
  }

  return { records: allRecords, knownTotal };
}

/**
 * 串行拉取全部分页数据
 *
 * 策略：逐页串行请求，确保页间数据不会因并发导致偏移遗漏。
 * 适用于对数据完整性要求高的场景（如销售明细全量加载）。
 *
 * @param fetchPage  获取指定页码(1-based)的回调，返回 records + total
 * @param pageSize   每页条数（用于判断是否还有下一页）
 * @returns 所有页的记录，按页码顺序拼接
 */
export async function fetchAllPagesSequential<T>(
  fetchPage: (current: number) => Promise<PageResult<T>>,
  pageSize: number
): Promise<T[]> {
  const allRecords: T[] = [];
  let current = 1;
  let knownTotal = 0;

  while (true) {
    const page = await fetchPage(current);
    allRecords.push(...page.records);

    // 第一页获取 total，后续页 ERP 可能返回 total=0，忽略
    if (current === 1 && page.total > 0) {
      knownTotal = page.total;
    }

    // 没有更多数据：本页记录数 < pageSize，或已达到已知总数
    if (page.records.length < pageSize || (knownTotal > 0 && allRecords.length >= knownTotal)) {
      break;
    }
    current++;
  }

  return allRecords;
}
