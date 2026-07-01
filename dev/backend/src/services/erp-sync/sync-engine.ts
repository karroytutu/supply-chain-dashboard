/**
 * ERP 数据同步引擎 - 核心执行器
 * 负责: 全量拉取 -> 转换 -> 计算 content_hash -> 分批 UPSERT -> 更新状态/日志
 * @module services/erp-sync/sync-engine
 */

import { createLogger } from '../../utils/logger';
import { appQuery, getAppClient } from '../../db/appPool';
import { createHash } from 'crypto';
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

  // 1. 获取 advisory lock
  const lockAcquired = await tryAcquireLock(sourceId);
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
    } else {
      // 窗口范围拉取
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
      await writeSyncLog(sourceId, startTime, 'success', 0, 0, 0);
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
    await writeSyncLog(sourceId, startTime, 'success', recordsFetched, recordsUpserted, recordsChanged);

    return {
      sourceId, success: true, recordsFetched,
      recordsUpserted, recordsChanged, durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`${sourceId}: 窗口同步失败 [${rangeLabel}]`, { error: errorMsg, durationMs });

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

/** 获取当前月份标签（北京时间） */
function currentMonthLabel(): string {
  const now = new Date();
  const beijing = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  return `${beijing.getFullYear()}-${String(beijing.getMonth() + 1).padStart(2, '0')}`;
}

/** 读取全量加载检查点 */
async function readCheckpoint(sourceId: string): Promise<string | null> {
  const result = await appQuery<{ full_load_checkpoint: string | null; full_load_complete: boolean }>(
    'SELECT full_load_checkpoint, full_load_complete FROM erp_sync_status WHERE source_id = $1',
    [sourceId]
  );
  if (result.rows.length === 0) return null;
  if (result.rows[0].full_load_complete) return null; // 已完成，不需要续传
  return result.rows[0].full_load_checkpoint;
}

/** 写入全量加载检查点 */
async function writeCheckpoint(sourceId: string, month: string): Promise<void> {
  await appQuery(
    'UPDATE erp_sync_status SET full_load_checkpoint = $2 WHERE source_id = $1',
    [sourceId, month]
  );
}

/** 标记全量加载完成 */
async function markFullLoadComplete(sourceId: string): Promise<void> {
  await appQuery(
    'UPDATE erp_sync_status SET full_load_complete = TRUE, full_load_checkpoint = NULL WHERE source_id = $1',
    [sourceId]
  );
}

/** 分批 INSERT（不含 DELETE，用于全量加载的逐月写入） */
async function batchInsertOnly(
  tableName: string,
  rows: Record<string, unknown>[]
): Promise<number> {
  if (rows.length === 0) return 0;

  const client = await getAppClient();
  try {
    await client.query('BEGIN');
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
    return totalInserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 阻塞式获取 advisory lock（带超时）
 * 用于全量加载等需要等待 cron 释放锁的场景
 */
async function waitForLock(
  sourceId: string,
  timeoutMs = 60000,
  retryIntervalMs = 2000
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const acquired = await tryAcquireLock(sourceId);
    if (acquired) return true;
    log.info(`等待锁释放: ${sourceId} (${Math.round((Date.now() - startTime) / 1000)}s / ${timeoutMs / 1000}s)`);
    await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
  }
  return false;
}

/**
 * 执行全量加载（按月分块 + 断点续传）
 * 参照 Airbyte Initial Sync 模式：
 * 1. 阻塞式获取 advisory lock（等待 cron 释放）
 * 2. 读取 checkpoint，确定起始月份
 * 3. 清除未完成部分的数据
 * 4. 按月遍历：fetchByRange -> transform -> batchInsert -> 更新 checkpoint
 * 5. 全部完成后标记 full_load_complete
 */
export async function executeInitialFullLoad(
  config: SyncSourceConfig,
  startDate: string  // '2020-01-01'
): Promise<SyncResult> {
  const startTime = Date.now();
  const sourceId = config.id;
  const timeColumn = config.timeColumn;

  if (!timeColumn || !config.fetchByRange) {
    return {
      sourceId, success: false, recordsFetched: 0,
      recordsUpserted: 0, recordsChanged: 0, durationMs: 0,
      error: '全量加载需要配置 timeColumn 和 fetchByRange',
    };
  }

  // 1. 阻塞式获取 advisory lock（等待 cron 释放，最多等 60 秒）
  const lockAcquired = await waitForLock(sourceId, 60000, 2000);
  if (!lockAcquired) {
    log.warn(`全量加载超时: ${sourceId} (无法获取 advisory lock)`);
    return {
      sourceId, success: false, recordsFetched: 0,
      recordsUpserted: 0, recordsChanged: 0, durationMs: 0,
      error: '无法获取 advisory lock（等待超时）',
    };
  }

  let totalFetched = 0;
  let totalInserted = 0;

  try {
    // 2. 读取 checkpoint
    const checkpoint = await readCheckpoint(sourceId);
    const startMonth = checkpoint ?? startDate.substring(0, 7); // '2020-01'
    const endMonth = currentMonthLabel();
    const isResume = checkpoint !== null;

    log.info(`全量加载: ${config.name} (${sourceId}) ${isResume ? `从检查点 ${checkpoint} 续传` : `从 ${startDate} 开始`}`);

    // 3. 清除未完成部分的数据
    if (isResume) {
      const deleteFrom = `${startMonth}-01`;
      const deleteResult = await appQuery(
        `DELETE FROM ${config.targetTable} WHERE ${timeColumn}::timestamp >= $1::timestamp`,
        [deleteFrom]
      );
      log.info(`全量加载: 清除检查点后数据 (${deleteFrom} ~), ${deleteResult.rowCount} 条`);
    } else {
      await appQuery(`DELETE FROM ${config.targetTable}`);
      log.info(`全量加载: 清空表 ${config.targetTable}`);
    }

    // 4. 生成月份列表
    const months = generateMonthRange(startMonth, endMonth);
    log.info(`全量加载: 共 ${months.length} 个月需要加载 (${startMonth} ~ ${endMonth})`);

    // 5. 按月遍历
    for (let i = 0; i < months.length; i++) {
      const { from, to, label } = months[i];

      // 拉取当月数据
      const records = await config.fetchByRange(from, to);
      totalFetched += records.length;

      // transform + batchInsert
      if (records.length > 0) {
        const rows = records.map(record => {
          const transformed = config.transform(record);
          transformed.raw_data = JSON.stringify(record);
          transformed.content_hash = computeContentHash(transformed, config.primaryKey);
          transformed.synced_at = new Date().toISOString();
          return transformed;
        });

        const inserted = await batchInsertOnly(config.targetTable, rows);
        totalInserted += inserted;
      }

      // 更新 checkpoint
      await writeCheckpoint(sourceId, label);

      log.info(`全量加载进度: ${label} 完成, 当月 ${records.length} 条, 累计 ${totalInserted} 条, ${i + 1}/${months.length} 月`);
    }

    // 6. 标记完成
    await markFullLoadComplete(sourceId);

    const durationMs = Date.now() - startTime;
    log.info(`全量加载完成: ${config.name} (${sourceId}), 共 ${totalInserted} 条, 耗时 ${Math.round(durationMs / 1000)}s`);

    await updateSyncStatus(sourceId, totalFetched, totalInserted, totalInserted, durationMs, true);
    await writeSyncLog(sourceId, startTime, 'success', totalFetched, totalInserted, totalInserted);

    return {
      sourceId, success: true, recordsFetched: totalFetched,
      recordsUpserted: totalInserted, recordsChanged: totalInserted,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`全量加载失败: ${sourceId}, 已加载 ${totalInserted} 条`, { error: errorMsg, durationMs });

    await updateSyncStatus(sourceId, totalFetched, 0, 0, durationMs, false, errorMsg);
    await writeSyncLog(sourceId, startTime, 'failed', totalFetched, 0, 0, errorMsg);

    return {
      sourceId, success: false, recordsFetched: totalFetched,
      recordsUpserted: 0, recordsChanged: 0,
      durationMs, error: errorMsg,
    };
  } finally {
    await releaseLock(sourceId);
  }
}

// =====================================================
// Advisory Lock（防并发）
// =====================================================

/** 尝试获取数据集级别的 advisory lock */
async function tryAcquireLock(sourceId: string): Promise<boolean> {
  const lockId = computeLockId(sourceId);
  const result = await appQuery<{ locked: boolean }>(
    'SELECT pg_try_advisory_lock($1) AS locked', [lockId]
  );
  return result.rows[0]?.locked ?? false;
}

/** 释放 advisory lock */
async function releaseLock(sourceId: string): Promise<void> {
  const lockId = computeLockId(sourceId);
  await appQuery('SELECT pg_advisory_unlock($1)', [lockId]).catch(() => {});
}

/** 计算 advisory lock ID（基于 source_id 的哈希） */
function computeLockId(sourceId: string): number {
  const hash = createHash('md5').update(`erp_sync:${sourceId}`).digest('hex');
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
  status: 'success' | 'failed' | 'circuit-open',
  recordsFetched: number,
  recordsUpserted: number,
  recordsChanged: number,
  errorMessage?: string
): Promise<void> {
  try {
    await appQuery(
      `INSERT INTO erp_sync_log
        (source_id, started_at, completed_at, duration_ms, status, records_fetched, records_upserted, records_changed, error_message)
      VALUES ($1, to_timestamp($2 / 1000.0), NOW(), $3, $4, $5, $6, $7, $8)`,
      [sourceId, startedAt, Date.now() - startedAt, status, recordsFetched, recordsUpserted, recordsChanged, errorMessage ?? null]
    );
  } catch (err) {
    log.error(`写入同步日志失败: ${sourceId}`, err);
  }
}
