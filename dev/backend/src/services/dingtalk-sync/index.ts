/**
 * 钉钉同步模块入口
 */

// 定时任务
export {
  syncDingtalkDepartments,
  fullSyncDingtalkUsers,
  incrementalSyncDingtalkUsers,
} from './dingtalk-sync.task';

// 同步操作（供控制器直接调用）
export { syncDepartments, syncUsers, syncUsersByDept } from './dingtalk-sync.mutation';

// 同步日志
export {
  getSyncLogs,
  getSyncLogById,
  getSyncStatus,
  createSyncLog,
  updateSyncLog,
} from './dingtalk-sync-log.query';

// 类型
export type {
  SyncLogRecord,
  SyncStats,
  SyncResult,
  SyncStatus,
  SyncLogQueryParams,
} from './dingtalk-sync.types';
