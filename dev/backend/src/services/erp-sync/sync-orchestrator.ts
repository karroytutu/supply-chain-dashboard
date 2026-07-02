/**
 * ERP 数据同步引擎 - 编排器
 * 负责: 调度所有数据集同步、熔断保护、强制同步
 * @module services/erp-sync/sync-orchestrator
 */

import { createLogger } from '../../utils/logger';
import { appQuery } from '../../db/appPool';
import { syncDataset, syncWindowedRange } from './sync-engine';
import type { SyncSourceConfig, SyncResult, CircuitState } from './sync-types';
import { SYNC_DEFAULTS } from './sync-types';

const log = createLogger('SyncOrchestrator');

// =====================================================
// 熔断器状态（内存中维护，持久化到 erp_sync_status）
// =====================================================

interface CircuitBreakerState {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;  // timestamp ms
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

/** 获取或初始化数据集的熔断器状态 */
function getCircuitBreaker(sourceId: string): CircuitBreakerState {
  if (!circuitBreakers.has(sourceId)) {
    circuitBreakers.set(sourceId, {
      state: 'closed',
      consecutiveFailures: 0,
      openedAt: null,
    });
  }
  return circuitBreakers.get(sourceId)!;
}

/** 检查熔断器是否允许执行 */
function isCircuitAllowed(sourceId: string): boolean {
  const cb = getCircuitBreaker(sourceId);

  if (cb.state === 'closed') return true;

  if (cb.state === 'open') {
    // 检查是否超过恢复超时
    if (cb.openedAt && Date.now() - cb.openedAt >= SYNC_DEFAULTS.circuitBreaker.recoveryTimeoutMs) {
      cb.state = 'half-open';
      log.info(`熔断器半开: ${sourceId} (尝试恢复)`);
      return true;
    }
    return false;
  }

  // half-open: 允许一次尝试
  return true;
}

/** 记录同步结果到熔断器 */
function recordCircuitResult(sourceId: string, success: boolean): void {
  const cb = getCircuitBreaker(sourceId);

  if (success) {
    if (cb.state === 'half-open') {
      log.info(`熔断器恢复: ${sourceId}`);
    }
    cb.state = 'closed';
    cb.consecutiveFailures = 0;
    cb.openedAt = null;
  } else {
    cb.consecutiveFailures++;
    if (cb.consecutiveFailures >= SYNC_DEFAULTS.circuitBreaker.failureThreshold) {
      cb.state = 'open';
      cb.openedAt = Date.now();
      log.warn(`熔断器打开: ${sourceId} (连续失败 ${cb.consecutiveFailures} 次，暂停 ${SYNC_DEFAULTS.circuitBreaker.recoveryTimeoutMs / 1000}s)`);

      // 持久化熔断状态到 DB
      appQuery(
        `UPDATE erp_sync_status SET circuit_state = 'open', circuit_opened_at = NOW() WHERE source_id = $1`,
        [sourceId]
      ).catch(err => log.error(`持久化熔断状态失败: ${sourceId}`, err));
    }
  }
}

// =====================================================
// 编排器核心
// =====================================================

/** 已注册的数据集配置 */
const registeredSources = new Map<string, SyncSourceConfig>();

/** 注册数据集配置 */
export function registerSource(config: SyncSourceConfig): void {
  registeredSources.set(config.id, config);
  log.info(`注册数据集: ${config.name} (${config.id}, type=${config.type})`);
}

/** 获取所有已注册的数据集 */
export function getRegisteredSources(): SyncSourceConfig[] {
  return Array.from(registeredSources.values());
}

/**
 * 同步所有 Type A（snapshot）数据集
 * 并行执行，由 ERP 限流器自然约束并发
 * Type B（flow-window）由独立调度触发
 */
export async function syncAllSnapshots(): Promise<SyncResult[]> {
  const snapshotSources = Array.from(registeredSources.values())
    .filter(s => s.type === 'snapshot');

  if (snapshotSources.length === 0) {
    log.warn('没有已注册的 snapshot 数据集');
    return [];
  }

  log.info(`开始同步 ${snapshotSources.length} 个 snapshot 数据集`);
  const startTime = Date.now();

  // 并行执行所有 Type A 同步
  const results = await Promise.allSettled(
    snapshotSources.map(source => syncWithCircuitBreaker(source))
  );

  const syncResults: SyncResult[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      sourceId: snapshotSources[i].id,
      success: false,
      recordsFetched: 0,
      recordsUpserted: 0,
      recordsChanged: 0,
      durationMs: 0,
      error: r.reason?.message ?? 'Unknown error',
    };
  });

  const succeeded = syncResults.filter(r => r.success).length;
  const failed = syncResults.filter(r => !r.success).length;
  log.info(`snapshot 同步完成: ${succeeded} 成功, ${failed} 失败, 耗时 ${Date.now() - startTime}ms`);

  return syncResults;
}

// =====================================================
// 窗口范围同步（windowed-replace 模式）
// =====================================================

/** 计算日期偏移（北京时间） */
function beijingDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // 转换为北京时间日期字符串 YYYY-MM-DD
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const beijing = new Date(utc + 8 * 3600000);
  return beijing.toISOString().split('T')[0];
}

/** 热窗口同步：近 7 天，每 2 分钟 */
export async function syncHotWindow(sourceId: string): Promise<SyncResult | null> {
  const source = registeredSources.get(sourceId);
  if (!source || !source.windows) {
    log.warn(`未找到 flow-window 数据集或缺少 windows 配置: ${sourceId}`);
    return null;
  }
  if (!isCircuitAllowed(sourceId)) {
    log.warn(`熔断器阻断热窗口: ${sourceId}`);
    return null;
  }

  const dateFrom = beijingDateOffset(-source.windows.hot);
  const dateTo = beijingDateOffset(1); // 包含今天
  log.info(`热窗口同步: ${source.name} (${sourceId}) [${dateFrom} ~ ${dateTo}]`);
  const result = await syncWindowedRange(source, dateFrom, dateTo, 'hot');
  recordCircuitResult(sourceId, result.success);
  return result;
}

/** 温窗口同步：8-60 天，每周 */
export async function syncWarmWindow(sourceId: string): Promise<SyncResult | null> {
  const source = registeredSources.get(sourceId);
  if (!source || !source.windows) {
    log.warn(`未找到 flow-window 数据集或缺少 windows 配置: ${sourceId}`);
    return null;
  }
  if (!isCircuitAllowed(sourceId)) {
    log.warn(`熔断器阻断温窗口: ${sourceId}`);
    return null;
  }

  const dateFrom = beijingDateOffset(-source.windows.warm);
  const dateTo = beijingDateOffset(-source.windows.hot);
  log.info(`温窗口同步: ${source.name} (${sourceId}) [${dateFrom} ~ ${dateTo}]`);
  const result = await syncWindowedRange(source, dateFrom, dateTo, 'warm');
  recordCircuitResult(sourceId, result.success);
  return result;
}

/** 冷窗口同步：60 天之前，每半月 */
export async function syncColdWindow(sourceId: string): Promise<SyncResult | null> {
  const source = registeredSources.get(sourceId);
  if (!source || !source.windows) {
    log.warn(`未找到 flow-window 数据集或缺少 windows 配置: ${sourceId}`);
    return null;
  }
  if (!isCircuitAllowed(sourceId)) {
    log.warn(`熔断器阻断冷窗口: ${sourceId}`);
    return null;
  }

  const dateFrom = null; // 无下界，拉取所有历史
  const dateTo = beijingDateOffset(-source.windows.cold);
  log.info(`冷窗口同步: ${source.name} (${sourceId}) [ALL ~ ${dateTo}]`);
  const result = await syncWindowedRange(source, dateFrom, dateTo, 'cold');
  recordCircuitResult(sourceId, result.success);
  return result;
}

/** 窗口类型定义 */
export type SyncWindow = 'hot' | 'warm' | 'cold' | 'all';

/** 强制同步指定数据集（绕过熔断器） */
export async function forceSync(sourceId: string, window?: SyncWindow): Promise<SyncResult | null> {
  const source = registeredSources.get(sourceId);
  if (!source) {
    log.warn(`未找到数据集: ${sourceId}`);
    return null;
  }

  // 重置熔断器
  resetCircuitBreaker(sourceId);

  // windowed-replace 类型：根据窗口参数路由
  if (source.syncMode === 'windowed-replace' && source.windows && window) {
    const w = source.windows;
    let dateFrom: string | null;
    let dateTo: string | null;

    switch (window) {
      case 'hot':
        dateFrom = beijingDateOffset(-w.hot);
        dateTo = beijingDateOffset(1);
        break;
      case 'warm':
        dateFrom = beijingDateOffset(-w.warm);
        dateTo = beijingDateOffset(-w.hot);
        break;
      case 'cold':
        dateFrom = null;
        dateTo = beijingDateOffset(-w.cold);
        break;
      case 'all':
        dateFrom = null;
        dateTo = null;
        break;
      default:
        log.warn(`无效的窗口参数: ${window}`);
        return {
          sourceId, success: false, recordsFetched: 0,
          recordsUpserted: 0, recordsChanged: 0, durationMs: 0,
          error: `无效的窗口参数: ${window}，可选值: hot, warm, cold, all`,
        };
    }

    log.info(`强制窗口同步: ${source.name} (${sourceId}) window=${window} [${dateFrom ?? 'ALL'} ~ ${dateTo ?? 'NOW'}]`);
    return syncWindowedRange(source, dateFrom, dateTo, window);
  }

  log.info(`强制同步: ${source.name} (${sourceId})`);
  return syncDataset(source);
}

/** 重置熔断器 */
export function resetCircuitBreaker(sourceId: string): void {
  const cb = getCircuitBreaker(sourceId);
  cb.state = 'closed';
  cb.consecutiveFailures = 0;
  cb.openedAt = null;

  appQuery(
    `UPDATE erp_sync_status SET circuit_state = 'closed', circuit_opened_at = NULL, consecutive_failures = 0 WHERE source_id = $1`,
    [sourceId]
  ).catch(err => log.error(`重置熔断状态失败: ${sourceId}`, err));

  log.info(`熔断器已重置: ${sourceId}`);
}

/** 获取所有熔断器状态 */
export function getAllCircuitBreakerStates(): Map<string, CircuitBreakerState> {
  return new Map(circuitBreakers);
}

// =====================================================
// 内部辅助
// =====================================================

/** 带熔断保护的同步执行 */
async function syncWithCircuitBreaker(source: SyncSourceConfig): Promise<SyncResult> {
  if (!isCircuitAllowed(source.id)) {
    log.warn(`熔断器阻断: ${source.id} (跳过本次同步)`);

    // 记录 circuit-open 日志
    await appQuery(
      `INSERT INTO erp_sync_log (source_id, started_at, completed_at, duration_ms, status, records_fetched, records_upserted, records_changed, error_message, sync_window)
       VALUES ($1, NOW(), NOW(), 0, 'circuit-open', 0, 0, 0, '熔断器阻断，跳过同步', NULL)`,
      [source.id]
    ).catch(() => {});

    return {
      sourceId: source.id,
      success: false,
      recordsFetched: 0,
      recordsUpserted: 0,
      recordsChanged: 0,
      durationMs: 0,
      error: '熔断器阻断',
    };
  }

  const result = await syncDataset(source);
  recordCircuitResult(source.id, result.success);
  return result;
}
