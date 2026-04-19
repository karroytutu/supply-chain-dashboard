/**
 * 钉钉同步控制器
 * 处理同步相关的HTTP请求
 */

import { Request, Response } from 'express';
import { syncUsers, syncUsersByDept } from '../services/dingtalk-sync';
import {
  getSyncLogs,
  getSyncLogById,
  getSyncStatus,
  createSyncLog,
  updateSyncLog,
} from '../services/dingtalk-sync';
import { hasRunningSync } from '../services/dingtalk-sync/dingtalk-sync-log.query';

/**
 * 触发全量同步
 */
export async function triggerFullSync(req: Request, res: Response) {
  try {
    // 防并发检查
    const { running, stuckLogId } = await hasRunningSync();
    if (running && !stuckLogId) {
      res.status(409).json({
        success: false,
        message: '已有同步任务在运行中，请稍后再试',
      });
      return;
    }

    const userId = (req as any).user?.userId;
    const logId = await createSyncLog({
      sync_type: 'full',
      trigger_type: 'manual',
      triggered_by: userId,
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

      res.json({
        success: true,
        data: { sync_log_id: logId, stats, duration_ms: durationMs },
      });
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      await updateSyncLog(logId, {
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
      });
      throw error;
    }
  } catch (error: any) {
    console.error('[DingtalkSync] 全量同步失败:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || '同步失败',
    });
  }
}

/**
 * 按部门同步用户
 */
export async function triggerDeptSync(req: Request, res: Response) {
  try {
    const { running } = await hasRunningSync();
    if (running) {
      res.status(409).json({
        success: false,
        message: '已有同步任务在运行中，请稍后再试',
      });
      return;
    }

    const deptId = req.params.deptId;
    if (!deptId) {
      res.status(400).json({ success: false, message: '缺少部门ID' });
      return;
    }

    const userId = (req as any).user?.userId;
    const logId = await createSyncLog({
      sync_type: 'department',
      trigger_type: 'manual',
      triggered_by: userId,
    });

    const startTime = Date.now();

    try {
      const stats = await syncUsersByDept(deptId);
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

      res.json({
        success: true,
        data: { sync_log_id: logId, stats, duration_ms: durationMs },
      });
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      await updateSyncLog(logId, {
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
      });
      throw error;
    }
  } catch (error: any) {
    console.error('[DingtalkSync] 部门同步失败:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || '同步失败',
    });
  }
}

/**
 * 获取同步日志列表
 */
export async function listSyncLogs(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const status = req.query.status as string;
    const sync_type = req.query.sync_type as string;

    const result = await getSyncLogs({ page, pageSize, status, sync_type });

    res.json({
      success: true,
      data: result.list,
      total: result.total,
      page,
      pageSize,
    });
  } catch (error: any) {
    console.error('[DingtalkSync] 获取同步日志失败:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || '获取日志失败',
    });
  }
}

/**
 * 获取同步日志详情
 */
export async function getSyncLogDetail(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ success: false, message: '无效的日志ID' });
      return;
    }

    const log = await getSyncLogById(id);
    if (!log) {
      res.status(404).json({ success: false, message: '日志不存在' });
      return;
    }

    res.json({ success: true, data: log });
  } catch (error: any) {
    console.error('[DingtalkSync] 获取同步日志详情失败:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || '获取日志详情失败',
    });
  }
}

/**
 * 获取当前同步状态
 */
export async function getCurrentSyncStatus(req: Request, res: Response) {
  try {
    const status = await getSyncStatus();
    res.json({ success: true, data: status });
  } catch (error: any) {
    console.error('[DingtalkSync] 获取同步状态失败:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || '获取同步状态失败',
    });
  }
}
