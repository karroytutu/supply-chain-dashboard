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
  initialFullLoad,
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
            circuit_state, circuit_opened_at, last_error_message
     FROM erp_sync_status ORDER BY source_id`
  );

  // 补充数据集名称（从注册表获取）
  const sources = getRegisteredSources();
  const sourceNameMap = new Map(sources.map(s => [s.id, s.name]));

  const statuses = result.rows.map(row => ({
    ...row,
    name: sourceNameMap.get(row.source_id) || row.source_id,
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

  let sql = `SELECT id, source_id, started_at, completed_at, duration_ms,
                    status, records_fetched, records_upserted, records_changed, error_message
             FROM erp_sync_log`;
  const params: unknown[] = [];

  if (sourceId) {
    sql += ' WHERE source_id = $1';
    params.push(sourceId);
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

/**
 * POST /api/erp-sync/:id/full-load
 * 触发首次全量加载（仅 windowed-replace 模式）
 * DELETE 全表 + INSERT 全部历史数据
 */
export async function handleFullLoad(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const { id } = req.params;
  log.info(`触发全量加载: ${id}`);

  const result = await initialFullLoad(id);

  if (!result) {
    res.status(404).json({ code: 404, message: `未找到数据集或不支持全量加载: ${id}` });
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
