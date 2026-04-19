/**
 * 钉钉同步日志查询模块
 * 负责同步日志的CRUD操作
 */

import { appQuery, getAppClient } from '../../db/appPool';
import type {
  SyncLogQueryParams,
  SyncLogRecord,
  CreateSyncLogParams,
  UpdateSyncLogParams,
} from './dingtalk-sync.types';

/**
 * 创建同步日志记录
 */
export async function createSyncLog(params: CreateSyncLogParams): Promise<number> {
  const result = await appQuery(
    `INSERT INTO dingtalk_sync_logs (sync_type, trigger_type, triggered_by, status)
     VALUES ($1, $2, $3, 'running')
     RETURNING id`,
    [params.sync_type, params.trigger_type, params.triggered_by || null]
  );
  return result.rows[0].id;
}

/**
 * 更新同步日志记录
 */
export async function updateSyncLog(id: number, params: UpdateSyncLogParams): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const fieldMap: Record<string, any> = {
    status: params.status,
    total_dingtalk_users: params.total_dingtalk_users,
    total_local_users: params.total_local_users,
    users_created: params.users_created,
    users_updated: params.users_updated,
    users_disabled: params.users_disabled,
    users_unchanged: params.users_unchanged,
    depts_created: params.depts_created,
    depts_updated: params.depts_updated,
    depts_synced: params.depts_synced,
    error_message: params.error_message,
    completed_at: params.completed_at,
    duration_ms: params.duration_ms,
  };

  for (const [key, value] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (fields.length === 0) return;

  values.push(id);
  await appQuery(
    `UPDATE dingtalk_sync_logs SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
    values
  );
}

/**
 * 分页查询同步日志
 */
export async function getSyncLogs(params: SyncLogQueryParams): Promise<{ list: SyncLogRecord[]; total: number }> {
  const { page, pageSize, status, sync_type } = params;
  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  if (sync_type) {
    conditions.push(`sync_type = $${paramIndex}`);
    values.push(sync_type);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await appQuery(
    `SELECT COUNT(*) as total FROM dingtalk_sync_logs ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const offset = (page - 1) * pageSize;
  const listResult = await appQuery(
    `SELECT * FROM dingtalk_sync_logs ${whereClause} ORDER BY started_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...values, pageSize, offset]
  );

  return { list: listResult.rows, total };
}

/**
 * 获取单条同步日志详情
 */
export async function getSyncLogById(id: number): Promise<SyncLogRecord | null> {
  const result = await appQuery(
    'SELECT * FROM dingtalk_sync_logs WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * 检查是否有正在运行的同步任务
 * 返回正在运行的任务，或超时需标记失败的任务
 */
export async function hasRunningSync(): Promise<{ running: boolean; stuckLogId?: number }> {
  const result = await appQuery(
    `SELECT id, started_at FROM dingtalk_sync_logs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`
  );

  if (result.rows.length === 0) {
    return { running: false };
  }

  const log = result.rows[0];
  const startedAt = new Date(log.started_at);
  const elapsed = Date.now() - startedAt.getTime();

  // 超过30分钟视为卡住
  if (elapsed > 30 * 60 * 1000) {
    return { running: true, stuckLogId: log.id };
  }

  return { running: true };
}

/**
 * 获取最近一次完成的同步日志
 */
export async function getLatestCompletedSync(): Promise<SyncLogRecord | null> {
  const result = await appQuery(
    `SELECT * FROM dingtalk_sync_logs
     WHERE status IN ('completed', 'failed')
     ORDER BY started_at DESC LIMIT 1`
  );
  return result.rows[0] || null;
}

/**
 * 获取当前同步状态（供前端轮询）
 */
export async function getSyncStatus(): Promise<{
  is_running: boolean;
  current_log?: SyncLogRecord;
  last_completed_log?: SyncLogRecord;
}> {
  const { running, stuckLogId } = await hasRunningSync();

  // 如果有卡住的任务，标记为失败
  if (stuckLogId) {
    await updateSyncLog(stuckLogId, {
      status: 'failed',
      error_message: '同步超时（超过30分钟），自动标记为失败',
      completed_at: new Date().toISOString(),
    });
    return { is_running: false, last_completed_log: (await getLatestCompletedSync()) ?? undefined };
  }

  let current_log: SyncLogRecord | undefined;
  if (running) {
    const result = await appQuery(
      `SELECT * FROM dingtalk_sync_logs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`
    );
    current_log = result.rows[0];
  }

  const last_completed_log = (await getLatestCompletedSync()) ?? undefined;

  return { is_running: running, current_log, last_completed_log };
}
