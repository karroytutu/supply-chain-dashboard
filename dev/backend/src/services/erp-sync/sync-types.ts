/**
 * ERP 数据同步引擎 - 类型定义
 * 定义同步引擎、数据集配置、后置处理器的所有接口
 * @module services/erp-sync/sync-types
 */

// =====================================================
// 数据集配置
// =====================================================

/** 同步类型：snapshot = 全量快照，flow-window = 滑动窗口 */
export type SyncType = 'snapshot' | 'flow-window';

/** 同步模式：upsert = ON CONFLICT 更新，replace = DELETE全表 + INSERT，windowed-replace = 窗口范围DELETE + INSERT */
export type SyncMode = 'upsert' | 'replace' | 'windowed-replace';

/** 后置处理器配置 */
export type PostProcessorConfig =
  | { type: 'changelog'; targetTable: string }
  | { type: 'daily-summary'; targetTable: string; groupBy: string[] }
  | { type: 'snapshot'; targetTable: string };

/** 滑动窗口配置 */
export interface WindowConfig {
  hot: number;             // 热窗口天数 (7)
  warm: number;            // 温窗口天数 (60)
  cold: number;            // 冷窗口起始天数 (60，表示 60 天之前)
  hotIntervalMs: number;   // 热窗口同步间隔 (120000 = 2分钟)
  warmIntervalMs: number;  // 温窗口同步间隔 (604800000 = 7天)
  coldIntervalMs: number;  // 冷窗口同步间隔 (1296000000 = 15天)
}

/** 数据集同步配置 */
export interface SyncSourceConfig {
  id: string;                                    // 数据集标识（如 debts, products）
  name: string;                                  // 显示名称（中文）
  type: SyncType;
  syncMode?: SyncMode;                           // 同步模式，默认 'upsert'
  fetchAll: () => Promise<unknown[]>;            // 全量拉取（内部自行处理分页）
  transform: (apiRecord: unknown) => Record<string, unknown>;  // API -> DB 行转换
  targetTable: string;                           // PostgreSQL 目标表名
  primaryKey: string[];                          // UPSERT 冲突键（仅 upsert 模式使用）
  intervalMs: number;                            // 同步间隔（ms）
  pageSize: number;                              // 分页大小（默认 2000）
  enableFallback: boolean;                       // 是否启用降级读取
  postProcessors?: PostProcessorConfig[];
  windows?: WindowConfig;                        // 仅 flow-window 类型
  timeColumn?: string;                           // 时间列名（仅 windowed-replace 模式）
  fetchByRange?: (dateFrom: string, dateTo: string) => Promise<unknown[]>;  // 按时间范围拉取
  fetchAllHistory?: () => Promise<unknown[]>;    // 首次全量拉取（不限时间）
}

// =====================================================
// 同步结果
// =====================================================

/** 单次同步结果 */
export interface SyncResult {
  sourceId: string;
  success: boolean;
  recordsFetched: number;
  recordsUpserted: number;
  recordsChanged: number;
  durationMs: number;
  error?: string;
}

/** 同步状态（对应 erp_sync_status 表） */
export interface SyncStatus {
  source_id: string;
  last_sync_at: Date | null;
  last_success_at: Date | null;
  last_duration_ms: number | null;
  total_records: number;
  consecutive_failures: number;
  total_syncs: number;
  total_failures: number;
  circuit_state: 'closed' | 'open' | 'half-open';
  circuit_opened_at: Date | null;
  last_error_message: string | null;
  window_counts: Record<string, number> | null;
}

/** 同步日志条目（对应 erp_sync_log 表） */
export interface SyncLogEntry {
  id?: number;
  source_id: string;
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
  status: 'success' | 'failed' | 'partial' | 'circuit-open';
  records_fetched: number;
  records_upserted: number;
  records_changed: number;
  error_message: string | null;
  sync_window: string | null;
}

// =====================================================
// 熔断器
// =====================================================

/** 熔断器状态 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/** 熔断器配置 */
export interface CircuitBreakerConfig {
  failureThreshold: number;   // 连续失败次数阈值（默认 3）
  recoveryTimeoutMs: number;  // 熔断恢复超时（默认 10 分钟）
}

// =====================================================
// 常量
// =====================================================

/** 同步引擎默认配置 */
export const SYNC_DEFAULTS = {
  batchSize: 200,              // 每批 UPSERT 条数
  pageSize: 2000,              // 默认分页大小
  intervalMs: 120000,          // 默认同步间隔 2 分钟
  circuitBreaker: {
    failureThreshold: 3,
    recoveryTimeoutMs: 600000, // 10 分钟
  } as CircuitBreakerConfig,
  rateLimitGroup: 'erp_sync', // 独立限流分组名
} as const;
