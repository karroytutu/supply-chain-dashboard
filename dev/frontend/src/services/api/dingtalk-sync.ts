/**
 * 钉钉同步 API 服务
 *
 * 注意：request 函数会解构后端的 { success, data } 格式，
 * 成功时直接返回 { data: ... } 部分，失败时抛异常。
 */

import request from './request';

/** 同步统计 */
export interface SyncStats {
  created: number;
  updated: number;
  disabled: number;
  unchanged: number;
  errors: number;
}

/** 同步日志记录 */
export interface SyncLogRecord {
  id: number;
  sync_type: string;
  trigger_type: string;
  triggered_by?: number;
  status: string;
  total_dingtalk_users: number;
  total_local_users: number;
  users_created: number;
  users_updated: number;
  users_disabled: number;
  users_unchanged: number;
  depts_created: number;
  depts_updated: number;
  depts_synced: number;
  error_message?: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
}

/** 同步状态 */
export interface SyncStatus {
  is_running: boolean;
  current_log?: SyncLogRecord;
  last_completed_log?: SyncLogRecord;
}

/** 触发全量同步 - 返回 { data: { sync_log_id, stats, duration_ms } } */
export async function triggerFullSync(): Promise<{ data: { sync_log_id: number; stats: SyncStats; duration_ms: number } }> {
  return request('/dingtalk-sync/full', { method: 'POST' });
}

/** 按部门同步 */
export async function triggerDeptSync(deptId: string): Promise<{ data: { sync_log_id: number; stats: SyncStats; duration_ms: number } }> {
  return request(`/dingtalk-sync/department/${deptId}`, { method: 'POST' });
}

/** 获取同步状态 - 返回 { data: SyncStatus } */
export async function getSyncStatus(): Promise<{ data: SyncStatus }> {
  return request('/dingtalk-sync/status');
}

/** 获取同步日志列表 - 返回 { data: SyncLogRecord[], total, page, pageSize } */
export async function getSyncLogs(params: {
  page: number;
  pageSize: number;
  status?: string;
  sync_type?: string;
}): Promise<{ data: SyncLogRecord[]; total: number; page: number; pageSize: number }> {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('pageSize', String(params.pageSize));
  if (params.status) query.set('status', params.status);
  if (params.sync_type) query.set('sync_type', params.sync_type);
  return request(`/dingtalk-sync/logs?${query.toString()}`);
}

/** 获取同步日志详情 - 返回 { data: SyncLogRecord } */
export async function getSyncLogDetail(id: number): Promise<{ data: SyncLogRecord }> {
  return request(`/dingtalk-sync/logs/${id}`);
}
