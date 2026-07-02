/**
 * ERP 同步状态监控控制器
 * 提供同步引擎状态查询、强制同步、熔断器重置等管理接口
 * @module controllers/erp-sync-status
 */

import { Request, Response, NextFunction } from 'express';
import { appQuery } from '../db/appPool';
import {
  forceSync,
  resetCircuitBreaker,
  getAllCircuitBreakerStates,
  getRegisteredSources,
} from '../services/erp-sync/sync-orchestrator';
import type { SyncWindow } from '../services/erp-sync/sync-orchestrator';
import { createLogger } from '../utils/logger';

const log = createLogger('ErpSyncStatus');

/**
 * GET /api/erp-sync/status
 * 获取所有数据源的同步状态
 */
export async function getSyncStatus(
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const result = await appQuery(
    `SELECT source_id, last_sync_at, last_success_at, last_duration_ms,
            total_records, consecutive_failures, total_syncs, total_failures,
            circuit_state, circuit_opened_at, last_error_message,
            window_counts
     FROM erp_sync_status ORDER BY source_id`
  );

  // 补充数据集名称（从注册表获取）
  const sources = getRegisteredSources();
  const sourceNameMap = new Map(sources.map(s => [s.id, s.name]));
  const flowWindowSources = sources.filter(s => s.type === 'flow-window').map(s => s.id);

  // 为 flow-window 类型数据集查询各窗口最近同步信息
  let windowsStatusMap = new Map<string, Array<{ window: string; last_success_at: string | null; last_duration_ms: number | null; last_status: string | null; total_records: number }>>();
  if (flowWindowSources.length > 0) {
    const windowResult = await appQuery(
      `SELECT DISTINCT ON (source_id, sync_window)
         source_id, sync_window, completed_at AS last_success_at,
         duration_ms AS last_duration_ms, status AS last_status
       FROM erp_sync_log
       WHERE source_id = ANY($1) AND sync_window IS NOT NULL AND status IN ('success', 'partial', 'failed')
       ORDER BY source_id, sync_window, started_at DESC`,
      [flowWindowSources]
    );
    for (const row of windowResult.rows) {
      const arr = windowsStatusMap.get(row.source_id) || [];
      arr.push({
        window: row.sync_window,
        last_success_at: row.last_success_at,
        last_duration_ms: row.last_duration_ms,
        last_status: row.last_status,
        total_records: 0, // 下面填充
      });
      windowsStatusMap.set(row.source_id, arr);
    }

    // 从 erp_sync_status.window_counts 读取预计算的各窗口数据量
    for (const sourceId of flowWindowSources) {
      const windows = windowsStatusMap.get(sourceId);
      if (!windows) continue;
      // 从状态表行中获取 window_counts
      const statusRow = result.rows.find((r: any) => r.source_id === sourceId);
      const windowCounts = statusRow?.window_counts as Record<string, number> | null;
      if (windowCounts) {
        for (const w of windows) {
          w.total_records = windowCounts[w.window] ?? 0;
        }
      }
    }
  }

  const statuses = result.rows.map(row => ({
    ...row,
    name: sourceNameMap.get(row.source_id) || row.source_id,
    windows_status: windowsStatusMap.get(row.source_id) || undefined,
  }));

  res.json({ code: 200, data: statuses });
}

/**
 * GET /api/erp-sync/log
 * 获取最近的同步日志
 */
export async function getSyncLog(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const sourceId = req.query.source_id as string | undefined;
  const window = req.query.window as string | undefined;

  let sql = `SELECT id, source_id, started_at, completed_at, duration_ms,
                    status, records_fetched, records_upserted, records_changed, error_message, sync_window
             FROM erp_sync_log`;
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (sourceId) {
    conditions.push(`source_id = $${conditions.length + 1}`);
    params.push(sourceId);
  }
  if (window) {
    conditions.push(`sync_window = $${conditions.length + 1}`);
    params.push(window);
  }
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ` ORDER BY started_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await appQuery(sql, params);
  res.json({ code: 200, data: result.rows });
}

/**
 * POST /api/erp-sync/:id/force-sync
 * 强制触发指定数据集的同步
 */
export async function handleForceSync(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const { id } = req.params;
  const window = req.body?.window as SyncWindow | undefined;

  // 校验 window 参数
  if (window && !['hot', 'warm', 'cold', 'all'].includes(window)) {
    res.status(400).json({ code: 400, message: `无效的窗口参数: ${window}，可选值: hot, warm, cold, all` });
    return;
  }

  log.info(`手动触发强制同步: ${id}${window ? ` (window=${window})` : ''}`);
  const result = await forceSync(id, window);

  if (!result) {
    res.status(404).json({ code: 404, message: `未找到数据集: ${id}` });
    return;
  }

  res.json({
    code: 200,
    data: {
      sourceId: result.sourceId,
      success: result.success,
      recordsFetched: result.recordsFetched,
      recordsUpserted: result.recordsUpserted,
      recordsChanged: result.recordsChanged,
      durationMs: result.durationMs,
      error: result.error || null,
    },
  });
}

/**
 * POST /api/erp-sync/:id/reset-circuit
 * 重置指定数据集的熔断器
 */
export async function handleResetCircuit(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const { id } = req.params;
  log.info(`手动重置熔断器: ${id}`);

  resetCircuitBreaker(id);
  res.json({ code: 200, message: `熔断器已重置: ${id}` });
}
