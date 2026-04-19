/**
 * 钉钉同步定时任务模块
 * 负责部门同步、全量用户同步、增量用户同步的定时任务入口
 */

import { syncDepartments, syncUsers, incrementalSyncUsers } from './dingtalk-sync.mutation';
import { createSyncLog, updateSyncLog, hasRunningSync } from './dingtalk-sync-log.query';
import type { TaskResult } from './dingtalk-sync.types';

/**
 * 部门同步定时任务
 * 每天 06:00 执行
 */
export async function syncDingtalkDepartments(): Promise<TaskResult> {
  console.log('[DingtalkSync] 开始执行部门同步定时任务...');

  // 防并发检查
  const { running } = await hasRunningSync();
  if (running) {
    console.log('[DingtalkSync] 已有同步任务在运行，跳过本次执行');
    return { processed: 0, succeeded: 0, failed: 0, pending: 0 };
  }

  const logId = await createSyncLog({
    sync_type: 'full',
    trigger_type: 'scheduled',
  });

  const startTime = Date.now();

  try {
    const deptResult = await syncDepartments();

    const durationMs = Date.now() - startTime;
    await updateSyncLog(logId, {
      status: 'completed',
      depts_created: deptResult.created,
      depts_updated: deptResult.updated,
      depts_synced: deptResult.total,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    });

    return {
      processed: deptResult.total,
      succeeded: deptResult.created + deptResult.updated,
      failed: 0,
      pending: deptResult.total - deptResult.created - deptResult.updated,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    await updateSyncLog(logId, {
      status: 'failed',
      error_message: error.message,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    });

    console.error('[DingtalkSync] 部门同步任务失败:', error.message);
    return { processed: 0, succeeded: 0, failed: 1, pending: 0 };
  }
}

/**
 * 全量用户同步定时任务
 * 每天 07:00 执行
 */
export async function fullSyncDingtalkUsers(): Promise<TaskResult> {
  console.log('[DingtalkSync] 开始执行全量用户同步定时任务...');

  const { running } = await hasRunningSync();
  if (running) {
    console.log('[DingtalkSync] 已有同步任务在运行，跳过本次执行');
    return { processed: 0, succeeded: 0, failed: 0, pending: 0 };
  }

  const logId = await createSyncLog({
    sync_type: 'full',
    trigger_type: 'scheduled',
  });

  const startTime = Date.now();

  try {
    const stats = await syncUsers();
    const durationMs = Date.now() - startTime;

    await updateSyncLog(logId, {
      status: 'completed',
      users_created: stats.created,
      users_updated: stats.updated,
      users_disabled: stats.disabled,
      users_unchanged: stats.unchanged,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    });

    return {
      processed: stats.created + stats.updated + stats.disabled + stats.unchanged,
      succeeded: stats.created + stats.updated + stats.disabled,
      failed: stats.errors,
      pending: stats.unchanged,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    await updateSyncLog(logId, {
      status: 'failed',
      error_message: error.message,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    });

    console.error('[DingtalkSync] 全量用户同步任务失败:', error.message);
    return { processed: 0, succeeded: 0, failed: 1, pending: 0 };
  }
}

/**
 * 增量用户同步定时任务
 * 每2小时执行一次
 */
export async function incrementalSyncDingtalkUsers(): Promise<TaskResult> {
  console.log('[DingtalkSync] 开始执行增量用户同步定时任务...');

  const { running } = await hasRunningSync();
  if (running) {
    console.log('[DingtalkSync] 已有同步任务在运行，跳过本次执行');
    return { processed: 0, succeeded: 0, failed: 0, pending: 0 };
  }

  const logId = await createSyncLog({
    sync_type: 'incremental',
    trigger_type: 'scheduled',
  });

  const startTime = Date.now();

  try {
    const stats = await incrementalSyncUsers();
    const durationMs = Date.now() - startTime;

    await updateSyncLog(logId, {
      status: 'completed',
      users_created: stats.created,
      users_updated: stats.updated,
      users_disabled: stats.disabled,
      users_unchanged: stats.unchanged,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    });

    return {
      processed: stats.created + stats.updated + stats.disabled + stats.unchanged,
      succeeded: stats.created + stats.updated + stats.disabled,
      failed: stats.errors,
      pending: stats.unchanged,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    await updateSyncLog(logId, {
      status: 'failed',
      error_message: error.message,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    });

    console.error('[DingtalkSync] 增量用户同步任务失败:', error.message);
    return { processed: 0, succeeded: 0, failed: 1, pending: 0 };
  }
}
