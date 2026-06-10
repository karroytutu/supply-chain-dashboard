/**
 * 催收管理 - 数据访问层 (Repository)
 * 当前仅保留缓存失效函数，供 erp-debt 模块调用
 * @module services/ar-collection/ar-collection.repository
 */

import { cache } from '../../utils/cache';

const CACHE_PREFIX = 'ar:collection';

// ==================== 缓存失效 ====================

/**
 * 失效指定任务相关的所有缓存
 * 写入操作（UPDATE/INSERT/DELETE）后调用
 */
export function invalidateTaskCache(taskId?: number): void {
  // 批量清除任务列表缓存
  cache.invalidate(`${CACHE_PREFIX}:tasks:`);

  if (taskId) {
    cache.invalidate(`${CACHE_PREFIX}:task:${taskId}`);
    cache.invalidate(`${CACHE_PREFIX}:details:${taskId}`);
    cache.invalidate(`${CACHE_PREFIX}:actions:${taskId}`);
    cache.invalidate(`${CACHE_PREFIX}:legal:${taskId}`);
  }

  // 处理人列表可能因任务状态变更而变化
  cache.invalidate(`${CACHE_PREFIX}:handlers`);
}

/**
 * 失效统计相关缓存
 */
export function invalidateStatsCache(): void {
  cache.invalidate(`${CACHE_PREFIX}:stats:`);
}
