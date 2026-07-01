/**
 * ERP 同步状态 API 服务
 */
import request from './request';

export interface SyncStatusItem {
  source_id: string;
  name: string;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_duration_ms: number | null;
  total_records: number;
  consecutive_failures: number;
  total_syncs: number;
  total_failures: number;
  circuit_state: 'closed' | 'open' | 'half-open';
  circuit_opened_at: string | null;
  last_error_message: string | null;
  full_load_checkpoint: string | null;
  full_load_complete: boolean;
}

export interface SyncLogItem {
  id: number;
  source_id: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: 'success' | 'failed' | 'circuit-open';
  records_fetched: number;
  records_upserted: number;
  records_changed: number;
  error_message: string | null;
}

export interface ForceSyncResult {
  sourceId: string;
  success: boolean;
  recordsFetched: number;
  recordsUpserted: number;
  recordsChanged: number;
  durationMs: number;
  error: string | null;
}

/** 获取所有数据源同步状态 */
export async function getSyncStatus(): Promise<SyncStatusItem[]> {
  return request.get<SyncStatusItem[]>('/erp-sync/status');
}

/** 获取同步日志 */
export async function getSyncLog(params: { limit?: number; source_id?: string }): Promise<SyncLogItem[]> {
  return request.get<SyncLogItem[]>('/erp-sync/log', { params });
}

export type SyncWindow = 'hot' | 'warm' | 'cold' | 'all';

/** 强制触发同步 */
export async function forceSync(sourceId: string, window?: SyncWindow): Promise<ForceSyncResult> {
  return request.post<ForceSyncResult>(`/erp-sync/${sourceId}/force-sync`, { window });
}

/** 重置熔断器 */
export async function resetCircuit(sourceId: string): Promise<void> {
  await request.post(`/erp-sync/${sourceId}/reset-circuit`);
}

/** 触发全量加载（仅 windowed-replace 模式数据集） */
export async function triggerFullLoad(sourceId: string): Promise<ForceSyncResult> {
  return request.post<ForceSyncResult>(`/erp-sync/${sourceId}/full-load`);
}
