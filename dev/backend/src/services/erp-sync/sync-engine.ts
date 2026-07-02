/**
 * ERP 数据同步引擎 - 核心执行器
 * 负责: 全量拉取 -> 转换 -> 计算 content_hash -> 分批 UPSERT -> 更新状态/日志
 * @module services/erp-sync/sync-engine
 */

import { createLogger } from '../../utils/logger';
import { appQuery, getAppClient } from '../../db/appPool';
import { createHash } from 'crypto';
import { config as appConfig } from '../../config';
import type { SyncSourceConfig, SyncResult } from './sync-types';
import { processDebtChangelog } from './post-processors/changelog.processor';
import { processDebtDailySummary, processSalesDailySummary } from './post-processors/daily-summary.processor';
import { processInventorySnapshot } from './post-processors/snapshot.processor';

const log = createLogger('SyncEngine');

/** 每批 UPSERT 条数 */
const BATCH_SIZE = 200;

/**
 * 执行后置处理器（独立错误域，处理器失败不影响主同步状态）
 * @param config 数据集配置
 * @param rows 本次同步写入的新数据
 * @param oldSnapshot UPSERT 前的旧快照（仅 changelog 类型需要）
 */
async function runPostProcessors(
  config: SyncSourceConfig,
  rows: Record<string, unknown>[],
  oldSnapshot?: Record<string, unknown>[]
): Promise<void> {
  if (!config.postProcessors?.length) return;

  for (const pp of config.postProcessors) {
    try {
      if (pp.type === 'changelog') {
        await processDebtChangelog(oldSnapshot ?? [], rows);
      } else if (pp.type === 'daily-summary') {
        if (pp.targetTable === 'erp_debt_daily_summary') {
          await processDebtDailySummary();
        } else if (pp.targetTable === 'erp_daily_sales_summary') {
          await processSalesDailySummary();
        }
      } else if (pp.type === 'snapshot') {
        await processInventorySnapshot();
      }
    } catch (err) {
      log.warn(`${config.id}: 后置处理器 ${pp.type} 执行失败`, err);
    }
  }
}

/**
 * 执行单个数据集的完整同步流程
 * 1. 获取 advisory lock（防并发）
 * 2. 调用 fetchAll() 拉取全量数据
 * 3. 逐条 transform + 计算 content_hash
 * 4. 分批 UPSERT（200 条/批）
 * 5. 写入 erp_sync_log + 更新 erp_sync_status
 */
export async function syncDataset(config: SyncSourceConfig): Promise<SyncResult> {
  const startTime = Date.now();
  const sourceId = config.id;

  log.info(`开始同步: ${config.name} (${sourceId})`);

  // 1. 获取 advisory lock
  const lockAcquired = await tryAcquireLock(sourceId);
  if (!lockAcquired) {
    log.warn(`跳过同步: ${sourceId} (另一个同步进程正在运行)`);
    return {
      sourceId, success: false, recordsFetched: 0,
      recordsUpserted: 0, recordsChanged: 0, durationMs: 0,
      error: '另一个同步进程正在运行',
    };
  }

  let recordsFetched = 0;
  let recordsUpserted = 0;
  let recordsChanged = 0;

  try {
    // 2. 全量拉取
    const allRecords = await config.fetchAll();
    recordsFetched = allRecords.length;
    log.info(`${sourceId}: 拉取 ${recordsFetched} 条记录`);

    if (recordsFetched === 0) {
      log.warn(`${sourceId}: ERP 返回空数据，跳过 UPSERT`);
      await updateSyncStatus(sourceId, recordsFetched, 0, 0, Date.now() - startTime, true);
      await writeSyncLog(sourceId, startTime, 'success', recordsFetched, 0, 0);
      return {
        sourceId, success: true, recordsFetched,
        recordsUpserted: 0, recordsChanged: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // 3. 转换 + 计算 content_hash
    const rows = allRecords.map(record => {
      const transformed = config.transform(record);
      transformed.raw_data = JSON.stringify(record);
      transformed.content_hash = computeContentHash(transformed, config.primaryKey);
      transformed.synced_at = new Date().toISOString();
      return transformed;
    });

    // 4. 分批写入（根据 syncMode 选择 UPSERT 或 REPLACE）
    // 4a. UPSERT 前拍快照（供 changelog 后置处理器对比）
    let oldSnapshot: Record<string, unknown>[] | undefined;
    if (config.postProcessors?.some(pp => pp.type === 'changelog')) {
      try {
        const oldResult = await appQuery(`SELECT bill_id, left_amount FROM ${config.targetTable}`);
        oldSnapshot = oldResult.rows;
      } catch (err) {
        log.warn(`${sourceId}: 获取旧快照失败`, err);
        oldSnapshot = [];
      }
    }

    // 4b. 执行写入
    const syncMode = config.syncMode ?? 'upsert';
    let upsertResult: UpsertResult;
    if (syncMode === 'replace') {
      upsertResult = await batchReplace(config.targetTable, rows);
    } else {
      upsertResult = await batchUpsert(config.targetTable, config.primaryKey, rows);
    }
    recordsUpserted = upsertResult.upserted;
    recordsChanged = upsertResult.changed;

    log.info(`${sourceId}: ${syncMode === 'replace' ? 'REPLACE' : 'UPSERT'} 完成 (写入=${recordsUpserted}, 变更=${recordsChanged})`);

    // 4c. 执行后置处理器（独立错误域，失败不影响主同步状态）
    await runPostProcessors(config, rows, oldSnapshot);

    // 5. 更新状态 + 日志
    const durationMs = Date.now() - startTime;
    await updateSyncStatus(sourceId, recordsFetched, recordsUpserted, recordsChanged, durationMs, true);
    await writeSyncLog(sourceId, startTime, 'success', recordsFetched, recordsUpserted, recordsChanged);

    return {
      sourceId, success: true, recordsFetched,
      recordsUpserted, recordsChanged, durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`${sourceId}: 同步失败`, { error: errorMsg, durationMs });

    await updateSyncStatus(sourceId, recordsFetched, 0, 0, durationMs, false, errorMsg);
    await writeSyncLog(sourceId, startTime, 'failed', recordsFetched, 0, 0, errorMsg);

    return {
      sourceId, success: false, recordsFetched,
      recordsUpserted: 0, recordsChanged: 0,
      durationMs, error: errorMsg,
    };
  } finally {
    await releaseLock(sourceId);
  }
}

// =====================================================
// 窗口范围替换（windowed-replace 模式）
// =====================================================

/**
 * 执行窗口范围同步（windowed-replace 模式）
 * DELETE 限定在时间窗口范围内，窗口外数据不动
 */
export async function syncWindowedRange(
  config: SyncSourceConfig,
  dateFrom: string | null,  // null 表示无下界（冷窗口/全量）
  dateTo: string | null,    // null 表示无上界（全量）
  window?: string,           // 窗口类型标识: hot/warm/cold/all
): Promise<SyncResult> {
  const startTime = Date.now();
  const sourceId = config.id;
  const timeColumn = config.timeColumn;

  if (!timeColumn) {
    return {
      sourceId, success: false, recordsFetched: 0,
      recordsUpserted: 0, recordsChanged: 0, durationMs: 0,
      error: 'windowed-replace 模式需要配置 timeColumn',
    };
  }

  const rangeLabel = `${dateFrom ?? 'ALL'} ~ ${dateTo ?? 'NOW'}`;
  log.info(`开始窗口同步: ${config.name} (${sourceId}) [${rangeLabel}]`);

  // 1. 获取窗口级别的 advisory lock（非阻塞，同一数据集不同窗口可并行）
  //    当 window='all' 时使用基础锁（不带窗口后缀），与所有窗口锁互斥，
  //    防止全量 DELETE 与正在运行的热/温/冷窗口产生数据冲突
  const lockWindow = window === 'all' ? undefined : window;
  const lockAcquired = await tryAcquireLock(sourceId, lockWindow);
  if (!lockAcquired) {
    log.warn(`跳过窗口同步: ${sourceId} (另一个同步进程正在运行)`);
    return {
      sourceId, success: false, recordsFetched: 0,
      recordsUpserted: 0, recordsChanged: 0, durationMs: 0,
      error: '另一个同步进程正在运行',
    };
  }

  let recordsFetched = 0;
  let recordsUpserted = 0;
  let recordsChanged = 0;

  try {
    // 2. 拉取数据
    let allRecords: unknown[];
    if (dateFrom === null && dateTo === null) {
      // 全量加载
      if (!config.fetchAllHistory) {
        throw new Error('全量加载需要配置 fetchAllHistory');
      }
      allRecords = await config.fetchAllHistory();
    } else if (dateFrom === null && dateTo !== null) {
      // 冷窗口：逐月原子替换（每月事务内 DELETE + INSERT），单月失败可跳过
      if (!config.fetchByRange) {
        throw new Error('窗口范围拉取需要配置 fetchByRange');
      }
      log.info(`${sourceId}: 冷窗口逐月同步开始 [ALL ~ ${dateTo}]`);

      // 逐月 fetch + transform + 原子替换（DELETE 该月 + INSERT 该月，同一事务）
      const months = generateMonthRange('2020-01', dateTo.substring(0, 7));
      let totalFetchedChunked = 0;
      let totalUpsertedChunked = 0;
      const skippedMonths: string[] = [];

      for (let i = 0; i < months.length; i++) {
        const chunk = months[i];
        let monthRecords: unknown[] = [];
        let retries = 0;
        const maxRetries = appConfig.erpSync.retryMax;

        while (retries <= maxRetries) {
          try {
            monthRecords = await config.fetchByRange(chunk.from, chunk.to);
            break;
          } catch (err) {
            retries++;
            if (retries > maxRetries) {
              log.warn(`${sourceId}: 冷窗口 ${chunk.label} 失败（${maxRetries}次重试后），跳过`);
              skippedMonths.push(chunk.label);
              monthRecords = [];
            } else {
              log.warn(`${sourceId}: 冷窗口 ${chunk.label} 失败，第${retries}次重试`);
              await new Promise(r => setTimeout(r, 2000));
            }
          }
        }

        if (monthRecords.length > 0) {
          const rows = monthRecords.map(record => {
            const transformed = config.transform(record);
            transformed.raw_data = JSON.stringify(record);
            transformed.content_hash = computeContentHash(transformed, config.primaryKey);
            transformed.synced_at = new Date().toISOString();
            return transformed;
          });

          // 逐月原子替换：同一事务中 DELETE 该月旧数据 + INSERT 该月新数据
          // DB 事务失败时跳过该月（不中断整个冷窗口同步）
          try {
            const client = await getAppClient();
            try {
              await client.query('BEGIN');
              await client.query(
                `DELETE FROM ${config.targetTable} WHERE ${timeColumn}::timestamptz >= $1::timestamptz AND ${timeColumn}::timestamptz < $2::timestamptz`,
                [chunk.from, chunk.to]
              );
              const inserted = await batchInsertInTransaction(client, config.targetTable, rows);
              await client.query('COMMIT');
              totalFetchedChunked += monthRecords.length;
              totalUpsertedChunked += inserted;
            } catch (err) {
              await client.query('ROLLBACK');
              log.warn(`${sourceId}: 冷窗口 ${chunk.label} DB写入失败，跳过`, { error: err });
              skippedMonths.push(chunk.label);
            } finally {
              client.release();
            }
          } catch (outerErr) {
            // getAppClient 本身失败也跳过
            log.warn(`${sourceId}: 冷窗口 ${chunk.label} 获取DB连接失败，跳过`, { error: outerErr });
            skippedMonths.push(chunk.label);
          }
        } else {
          // 仅在 ERP 成功返回空数据时删除旧数据；fetch 失败（已在 skippedMonths 中）则跳过，保留本地已有数据
          if (!skippedMonths.includes(chunk.label)) {
            try {
              const client = await getAppClient();
              try {
                await client.query(
                  `DELETE FROM ${config.targetTable} WHERE ${timeColumn}::timestamptz >= $1::timestamptz AND ${timeColumn}::timestamptz < $2::timestamptz`,
                  [chunk.from, chunk.to]
                );
              } finally {
                client.release();
              }
            } catch (err) {
              log.warn(`${sourceId}: 冷窗口 ${chunk.label} 清空旧数据失败，跳过`, { error: err });
              skippedMonths.push(chunk.label);
            }
          }
        }

        if (skippedMonths.includes(chunk.label)) {
          log.warn(`${sourceId}: 冷窗口 ${chunk.label} 跳过 (fetch/写入失败) ${i + 1}/${months.length}`);
        } else {
          log.info(`${sourceId}: 冷窗口 ${chunk.label} 完成 (${monthRecords.length}条) ${i + 1}/${months.length}`);
        }
      }

      recordsFetched = totalFetchedChunked;
      recordsUpserted = totalUpsertedChunked;

      if (skippedMonths.length > 0) {
        log.warn(`${sourceId}: 冷窗口同步部分完成，跳过月份: ${skippedMonths.join(', ')}`);
      }

      // 直接更新状态/日志并返回（不走通用写入路径）
      const durationMs = Date.now() - startTime;
      const syncSuccess = skippedMonths.length === 0;
      const logStatus: 'success' | 'failed' | 'partial' = skippedMonths.length === 0
        ? 'success'
        : skippedMonths.length === months.length
          ? 'failed'
          : 'partial';
      const errorMsg = skippedMonths.length > 0
        ? `跳过 ${skippedMonths.length} 个月: ${skippedMonths.join(', ')}`
        : undefined;

      await updateSyncStatus(sourceId, recordsFetched, recordsUpserted, 0, durationMs, syncSuccess, errorMsg);
      await writeSyncLog(sourceId, startTime, logStatus, recordsFetched, recordsUpserted, 0, errorMsg, window);

      // 更新窗口数据量预计算值（仅成功或部分成功时）
      if (recordsUpserted > 0 || recordsFetched > 0) {
        await updateWindowCounts(config);
      }

      return {
        sourceId, success: syncSuccess, recordsFetched,
        recordsUpserted, recordsChanged: 0, durationMs,
        error: errorMsg,
      };
    } else {
      // 窗口范围拉取（热/温窗口）
      if (!config.fetchByRange) {
        throw new Error('窗口范围拉取需要配置 fetchByRange');
      }
      allRecords = await config.fetchByRange(
        dateFrom ?? '2000-01-01',
        dateTo ?? new Date().toISOString().split('T')[0]
      );
    }
    recordsFetched = allRecords.length;
    log.info(`${sourceId}: 拉取 ${recordsFetched} 条记录 [${rangeLabel}]`);

    if (recordsFetched === 0) {
      log.warn(`${sourceId}: ERP 返回空数据，跳过写入`);
      await updateSyncStatus(sourceId, 0, 0, 0, Date.now() - startTime, true);
      await writeSyncLog(sourceId, startTime, 'success', 0, 0, 0, undefined, window);
      return {
        sourceId, success: true, recordsFetched: 0,
        recordsUpserted: 0, recordsChanged: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // 3. 转换 + 计算 content_hash
    const rows = allRecords.map(record => {
      const transformed = config.transform(record);
      transformed.raw_data = JSON.stringify(record);
      transformed.content_hash = computeContentHash(transformed, config.primaryKey);
      transformed.synced_at = new Date().toISOString();
      return transformed;
    });

    // 4. 窗口范围替换（DELETE + INSERT in transaction）
    const result = await batchWindowedReplace(
      config.targetTable, timeColumn, dateFrom, dateTo, rows
    );
    recordsUpserted = result.upserted;
    recordsChanged = result.changed;

    log.info(`${sourceId}: WINDOWED-REPLACE 完成 (写入=${recordsUpserted}) [${rangeLabel}]`);

    // 4b. 执行后置处理器（独立错误域，失败不影响主同步状态）
    await runPostProcessors(config, rows);

    // 5. 更新状态 + 日志
    const durationMs = Date.now() - startTime;
    await updateSyncStatus(sourceId, recordsFetched, recordsUpserted, recordsChanged, durationMs, true);
    await writeSyncLog(sourceId, startTime, 'success', recordsFetched, recordsUpserted, recordsChanged, undefined, window);

    // 更新窗口数据量预计算值（热窗口跳过，避免每2分钟全表扫描）
    if (window !== 'hot') {
      await updateWindowCounts(config);
    }

    return {
      sourceId, success: true, recordsFetched,
      recordsUpserted, recordsChanged, durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`${sourceId}: 窗口同步失败 [${rangeLabel}]`, { error: errorMsg, durationMs });

    await updateSyncStatus(sourceId, recordsFetched, 0, 0, durationMs, false, errorMsg);
    await writeSyncLog(sourceId, startTime, 'failed', recordsFetched, 0, 0, errorMsg, window);

    return {
      sourceId, success: false, recordsFetched,
      recordsUpserted: 0, recordsChanged: 0,
      durationMs, error: errorMsg,
    };
  } finally {
    await releaseLock(sourceId, lockWindow);
  }
}

/**
 * 窗口范围替换：DELETE 限定范围 + INSERT 新数据
 * 在事务中执行，保证原子性
 */
async function batchWindowedReplace(
  tableName: string,
  timeColumn: string,
  dateFrom: string | null,
  dateTo: string | null,
  rows: Record<string, unknown>[]
): Promise<UpsertResult> {
  const client = await getAppClient();
  try {
    await client.query('BEGIN');

    // 1. DELETE 限定在窗口范围内
    let deleteSql: string;
    let deleteParams: unknown[];

    if (dateFrom === null && dateTo === null) {
      // 全量：DELETE 全表
      deleteSql = `DELETE FROM ${tableName}`;
      deleteParams = [];
    } else if (dateFrom === null) {
      // 冷窗口：DELETE WHERE timeColumn < dateTo
      deleteSql = `DELETE FROM ${tableName} WHERE ${timeColumn} < $1`;
      deleteParams = [dateTo];
    } else if (dateTo === null) {
      // 无上界：DELETE WHERE timeColumn >= dateFrom
      deleteSql = `DELETE FROM ${tableName} WHERE ${timeColumn} >= $1`;
      deleteParams = [dateFrom];
    } else {
      // 范围：DELETE WHERE timeColumn >= dateFrom AND timeColumn < dateTo
      deleteSql = `DELETE FROM ${tableName} WHERE ${timeColumn} >= $1 AND ${timeColumn} < $2`;
      deleteParams = [dateFrom, dateTo];
    }

    const deleteResult = await client.query(deleteSql, deleteParams);
    log.debug(`WINDOWED-DELETE: ${deleteResult.rowCount} rows removed`);

    // 2. 分批 INSERT（排除 id 列，serial 自增）
    let totalInserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const columns = Object.keys(batch[0]);
      const insertColumns = columns.filter(col => col !== 'id');

      const valuePlaceholders: string[] = [];
      const allValues: unknown[] = [];
      let paramIndex = 1;

      for (const row of batch) {
        const rowPlaceholders: string[] = [];
        for (const col of insertColumns) {
          rowPlaceholders.push(`$${paramIndex}`);
          allValues.push(row[col] ?? null);
          paramIndex++;
        }
        valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
      }

      const columnList = insertColumns.join(', ');
      const sql = `INSERT INTO ${tableName} (${columnList}) VALUES ${valuePlaceholders.join(', ')}`;
      const result = await client.query(sql, allValues);
      totalInserted += result.rowCount ?? 0;
    }

    await client.query('COMMIT');
    return { upserted: totalInserted, changed: totalInserted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =====================================================
// 全量加载（按月分块 + 断点续传）
// =====================================================

interface MonthChunk {
  from: string;   // 'YYYY-MM-DD'
  to: string;     // 'YYYY-MM-DD'
  label: string;  // 'YYYY-MM'
}

/** 生成月份范围列表 */
function generateMonthRange(startMonth: string, endMonth: string): MonthChunk[] {
  const chunks: MonthChunk[] = [];
  const [startYear, startMon] = startMonth.split('-').map(Number);
  const [endYear, endMon] = endMonth.split('-').map(Number);

  let year = startYear;
  let month = startMon;

  while (year < endYear || (year === endYear && month <= endMon)) {
    const label = `${year}-${String(month).padStart(2, '0')}`;
    const from = `${year}-${String(month).padStart(2, '0')}-01`;

    // 计算下个月的第一天
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const to = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    chunks.push({ from, to, label });

    month = nextMonth;
    year = nextYear;
  }

  return chunks;
}

/** 分批 INSERT（复用已有连接/事务，用于冷窗口逐月写入） */
async function batchInsertInTransaction(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> },
  tableName: string,
  rows: Record<string, unknown>[]
): Promise<number> {
  if (rows.length === 0) return 0;
  let totalInserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const columns = Object.keys(batch[0]);
    const insertColumns = columns.filter(col => col !== 'id');

    const valuePlaceholders: string[] = [];
    const allValues: unknown[] = [];
    let paramIndex = 1;

    for (const row of batch) {
      const rowPlaceholders: string[] = [];
      for (const col of insertColumns) {
        rowPlaceholders.push(`$${paramIndex}`);
        allValues.push(row[col] ?? null);
        paramIndex++;
      }
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    const columnList = insertColumns.join(', ');
    const sql = `INSERT INTO ${tableName} (${columnList}) VALUES ${valuePlaceholders.join(', ')}`;
    const result = await client.query(sql, allValues);
    totalInserted += result.rowCount ?? 0;
  }
  return totalInserted;
}

// =====================================================
// Advisory Lock（防并发）
// =====================================================

/** 尝试获取数据集级别的 advisory lock */
async function tryAcquireLock(sourceId: string, window?: string): Promise<boolean> {
  const lockId = computeLockId(sourceId, window);
  const result = await appQuery<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock($1) AS locked', [lockId]
  );
  return result.rows[0]?.locked ?? false;
}

/** 释放 advisory lock */
async function releaseLock(sourceId: string, window?: string): Promise<void> {
  const lockId = computeLockId(sourceId, window);
  await appQuery('SELECT pg_advisory_unlock($1)', [lockId]).catch(() => {});
}

/**
 * 计算 advisory lock ID（基于 source_id + window 的哈希）
 *
 * 注意：锁粒度为 source_id + window，意味着同一数据集的不同窗口可以并行执行。
 * 并行安全的前提是各窗口的日期范围不重叠（热=7天/温=60天/冷=更早），
 * 如果未来新增窗口的日期范围有重叠，需要重新评估并发策略。
 */
function computeLockId(sourceId: string, window?: string): number {
  const key = window ? `erp_sync:${sourceId}:${window}` : `erp_sync:${sourceId}`;
  const hash = createHash('md5').update(key).digest('hex');
  return parseInt(hash.substring(0, 8), 16);
}

// =====================================================
// Content Hash（增量检测）
// =====================================================

/** 计算行数据的 content_hash（排除 raw_data, content_hash, synced_at） */
function computeContentHash(
  row: Record<string, unknown>,
  primaryKey: string[]
): string {
  const hashData: Record<string, unknown> = {};
  const excludedKeys = new Set(['raw_data', 'content_hash', 'synced_at', ...primaryKey]);

  for (const [key, value] of Object.entries(row)) {
    if (!excludedKeys.has(key)) {
      hashData[key] = value;
    }
  }

  return createHash('md5').update(JSON.stringify(hashData)).digest('hex');
}

// =====================================================
// 分批 UPSERT
// =====================================================

interface UpsertResult {
  upserted: number;
  changed: number;
}

/** 分批执行 UPSERT（每批 200 条） */
async function batchUpsert(
  tableName: string,
  primaryKey: string[],
  rows: Record<string, unknown>[]
): Promise<UpsertResult> {
  let totalUpserted = 0;
  let totalChanged = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const result = await executeUpsert(tableName, primaryKey, batch);
    totalUpserted += result.upserted;
    totalChanged += result.changed;
  }

  return { upserted: totalUpserted, changed: totalChanged };
}

/**
 * 分批执行 REPLACE（DELETE all + INSERT all）
 * 适用于 ERP 数据存在完全重复行的场景（如 erp_batch_inventory）
 * 使用 serial 代理主键，自然键降级为普通索引
 */
async function batchReplace(
  tableName: string,
  rows: Record<string, unknown>[]
): Promise<UpsertResult> {
  // 在事务中执行 DELETE + INSERT
  const client = await getAppClient();
  try {
    await client.query('BEGIN');

    // 清空表
    await client.query(`DELETE FROM ${tableName}`);

    // 分批插入
    let totalInserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const columns = Object.keys(batch[0]);
      // 排除 id 列（serial 自动生成）
      const insertColumns = columns.filter(col => col !== 'id');

      const valuePlaceholders: string[] = [];
      const allValues: unknown[] = [];
      let paramIndex = 1;

      for (const row of batch) {
        const rowPlaceholders: string[] = [];
        for (const col of insertColumns) {
          rowPlaceholders.push(`$${paramIndex}`);
          allValues.push(row[col] ?? null);
          paramIndex++;
        }
        valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
      }

      const columnList = insertColumns.join(', ');
      const sql = `INSERT INTO ${tableName} (${columnList}) VALUES ${valuePlaceholders.join(', ')}`;
      const result = await client.query(sql, allValues);
      totalInserted += result.rowCount ?? 0;
    }

    await client.query('COMMIT');
    return { upserted: totalInserted, changed: totalInserted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** 执行单批 UPSERT */
async function executeUpsert(
  tableName: string,
  primaryKey: string[],
  batch: Record<string, unknown>[]
): Promise<UpsertResult> {
  if (batch.length === 0) return { upserted: 0, changed: 0 };

  // 获取所有列名（从第一行推断）
  const columns = Object.keys(batch[0]);
  const pkSet = new Set(primaryKey);

  // 构建 UPDATE SET 子句（排除主键列）
  const updateColumns = columns.filter(col => !pkSet.has(col));
  const setClause = updateColumns
    .map(col => `${col} = EXCLUDED.${col}`)
    .join(', ');

  // 构建 VALUES 占位符
  const valuePlaceholders: string[] = [];
  const allValues: unknown[] = [];
  let paramIndex = 1;

  for (const row of batch) {
    const rowPlaceholders: string[] = [];
    for (const col of columns) {
      rowPlaceholders.push(`$${paramIndex}`);
      allValues.push(row[col] ?? null);
      paramIndex++;
    }
    valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
  }

  // 构建完整 UPSERT SQL
  const columnList = columns.join(', ');
  const pkList = primaryKey.join(', ');
  const sql = `
    INSERT INTO ${tableName} (${columnList})
    VALUES ${valuePlaceholders.join(', ')}
    ON CONFLICT (${pkList}) DO UPDATE SET
      ${setClause}
    WHERE ${tableName}.content_hash IS DISTINCT FROM EXCLUDED.content_hash
  `;

  const result = await appQuery(sql, allValues);
  // rowCount 包含实际 INSERT + UPDATE 的行数
  const rowCount = result.rowCount ?? 0;

  return {
    upserted: batch.length,  // 所有行都尝试了 UPSERT
    changed: rowCount,       // 实际发生变化的行数（INSERT + 真正 UPDATE 的）
  };
}

// =====================================================
// 状态 + 日志写入
// =====================================================

/** 更新 erp_sync_status 表 */
async function updateSyncStatus(
  sourceId: string,
  recordsFetched: number,
  recordsUpserted: number,
  recordsChanged: number,
  durationMs: number,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  try {
    if (success) {
      await appQuery(
        `UPDATE erp_sync_status SET
          last_sync_at = NOW(),
          last_success_at = NOW(),
          last_duration_ms = $2,
          total_records = $3,
          consecutive_failures = 0,
          total_syncs = total_syncs + 1,
          last_error_message = NULL
        WHERE source_id = $1`,
        [sourceId, durationMs, recordsFetched]
      );
    } else {
      await appQuery(
        `UPDATE erp_sync_status SET
          last_sync_at = NOW(),
          last_duration_ms = $2,
          consecutive_failures = consecutive_failures + 1,
          total_syncs = total_syncs + 1,
          total_failures = total_failures + 1,
          last_error_message = $3
        WHERE source_id = $1`,
        [sourceId, durationMs, errorMessage ?? null]
      );
    }
  } catch (err) {
    log.error(`更新同步状态失败: ${sourceId}`, err);
  }
}

/** 写入 erp_sync_log 表 */
async function writeSyncLog(
  sourceId: string,
  startedAt: number,
  status: 'success' | 'failed' | 'partial' | 'circuit-open',
  recordsFetched: number,
  recordsUpserted: number,
  recordsChanged: number,
  errorMessage?: string,
  syncWindow?: string
): Promise<void> {
  try {
    await appQuery(
      `INSERT INTO erp_sync_log
        (source_id, started_at, completed_at, duration_ms, status, records_fetched, records_upserted, records_changed, error_message, sync_window)
      VALUES ($1, to_timestamp($2 / 1000.0), NOW(), $3, $4, $5, $6, $7, $8, $9)`,
      [sourceId, startedAt, Date.now() - startedAt, status, recordsFetched, recordsUpserted, recordsChanged, errorMessage ?? null, syncWindow ?? null]
    );
  } catch (err) {
    log.error(`写入同步日志失败: ${sourceId}`, err);
  }
}

// =====================================================
// 窗口数据量预计算（存储到 erp_sync_status.window_counts）
// =====================================================

/** 查询目标表各窗口数据量并存入 erp_sync_status.window_counts */
async function updateWindowCounts(sourceConfig: SyncSourceConfig): Promise<void> {
  const timeColumn = sourceConfig.timeColumn;
  if (!timeColumn) return;

  try {
    const hotDays = sourceConfig.windows?.hot ?? 7;
    const warmDays = sourceConfig.windows?.warm ?? 60;
    const countResult = await appQuery(
      `SELECT
         COUNT(*) FILTER (WHERE ${timeColumn}::timestamptz >= NOW() - make_interval(days => $1)) AS hot,
         COUNT(*) FILTER (WHERE ${timeColumn}::timestamptz >= NOW() - make_interval(days => $2) AND ${timeColumn}::timestamptz < NOW() - make_interval(days => $1)) AS warm,
         COUNT(*) FILTER (WHERE ${timeColumn}::timestamptz < NOW() - make_interval(days => $2)) AS cold
       FROM ${sourceConfig.targetTable}`,
      [hotDays, warmDays]
    );
    const counts = countResult.rows[0];
    const windowCounts = {
      hot: parseInt(counts.hot, 10),
      warm: parseInt(counts.warm, 10),
      cold: parseInt(counts.cold, 10),
    };
    await appQuery(
      `UPDATE erp_sync_status SET window_counts = $1 WHERE source_id = $2`,
      [JSON.stringify(windowCounts), sourceConfig.id]
    );
  } catch (err) {
    log.warn(`${sourceConfig.id}: 更新窗口数据量失败`, err);
  }
}
