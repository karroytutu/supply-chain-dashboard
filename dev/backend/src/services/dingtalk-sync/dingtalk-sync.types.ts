/** 钉钉同步模块类型定义 */

/** 钉钉部门原始数据（从 /topapi/v2/department/listsub 返回） */
export interface DingtalkDeptInfo {
  dept_id: number;
  name: string;
  parent_id?: number;
  auto_add_user?: boolean;
}

/** 钉钉用户完整数据（从 /topapi/v2/user/get 返回） */
export interface DingtalkSyncUserInfo {
  userid: string;
  unionid: string;
  name: string;
  avatar?: string;
  mobile?: string;
  email?: string;
  dept_id_list: number[];
  title?: string;
}

/** 钉钉用户列表项（从 /topapi/v2/user/list 返回） */
export interface DingtalkUserListItem {
  userid: string;
  name: string;
}

/** 同步统计 */
export interface SyncStats {
  created: number;
  updated: number;
  disabled: number;
  unchanged: number;
  errors: number;
}

/** 部门同步结果 */
export interface DeptSyncResult {
  created: number;
  updated: number;
  total: number;
}

/** 同步参数 */
export interface SyncOptions {
  sync_type: 'full' | 'department' | 'incremental';
  dept_id?: string;
  trigger_type: 'scheduled' | 'manual';
  triggered_by?: number;
}

/** 同步结果 */
export interface SyncResult {
  sync_log_id: number;
  stats: SyncStats;
  dept_result?: DeptSyncResult;
  duration_ms: number;
}

/** 同步日志查询参数 */
export interface SyncLogQueryParams {
  page: number;
  pageSize: number;
  status?: string;
  sync_type?: string;
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

/** 创建同步日志参数 */
export interface CreateSyncLogParams {
  sync_type: string;
  trigger_type: string;
  triggered_by?: number;
}

/** 更新同步日志参数 */
export interface UpdateSyncLogParams {
  status?: string;
  total_dingtalk_users?: number;
  total_local_users?: number;
  users_created?: number;
  users_updated?: number;
  users_disabled?: number;
  users_unchanged?: number;
  depts_created?: number;
  depts_updated?: number;
  depts_synced?: number;
  error_message?: string;
  completed_at?: string;
  duration_ms?: number;
}

/** 同步状态（供前端轮询） */
export interface SyncStatus {
  is_running: boolean;
  current_log?: SyncLogRecord;
  last_completed_log?: SyncLogRecord;
}

/** 定时任务返回结果 */
export interface TaskResult {
  processed: number;
  succeeded: number;
  failed: number;
  pending: number;
}
