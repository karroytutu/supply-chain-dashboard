/**
 * Token 管理数据访问层
 * 封装 erp_tokens 表和 token_operation_logs 表的 CRUD 操作
 * @module services/token-manager/token-repository
 */

import { appQuery } from '../../db/appPool';
import type { TokenSystem, TokenRecord, TokenLoginStatus, LogOperationParams } from './token-types';

// ==================== erp_tokens 读写 ====================

/**
 * 获取指定系统的 Token 记录
 */
export async function getTokenRecord(system: TokenSystem): Promise<TokenRecord | null> {
  const result = await appQuery(
    'SELECT * FROM erp_tokens WHERE system = $1',
    [system]
  );
  return result.rows[0] || null;
}

/**
 * 获取所有系统的 Token 记录
 */
export async function getAllTokenRecords(): Promise<Record<string, TokenRecord>> {
  const result = await appQuery('SELECT * FROM erp_tokens ORDER BY system');
  const records: Record<string, TokenRecord> = {};
  for (const row of result.rows) {
    records[row.system] = row;
  }
  return records;
}

/**
 * 保存或更新 Token（UPSERT）
 */
export async function saveToken(params: {
  system: TokenSystem;
  tokenValue: string;
  tokenSecondary?: string | null;
  tokenMeta?: Record<string, unknown> | null;
  loginStatus?: TokenLoginStatus;
  needsSms?: boolean;
  expiresAt?: Date | null;
}): Promise<void> {
  await appQuery(
    `INSERT INTO erp_tokens (system, token_value, token_secondary, token_meta, login_status, needs_sms, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (system) DO UPDATE SET
       token_value = EXCLUDED.token_value,
       token_secondary = COALESCE(EXCLUDED.token_secondary, erp_tokens.token_secondary),
       token_meta = COALESCE(EXCLUDED.token_meta, erp_tokens.token_meta),
       login_status = EXCLUDED.login_status,
       needs_sms = EXCLUDED.needs_sms,
       expires_at = EXCLUDED.expires_at`,
    [
      params.system,
      params.tokenValue,
      params.tokenSecondary || null,
      params.tokenMeta ? JSON.stringify(params.tokenMeta) : null,
      params.loginStatus || 'success',
      params.needsSms || false,
      params.expiresAt || null,
    ]
  );
}

/**
 * 更新 Token 登录状态
 */
export async function updateLoginStatus(
  system: TokenSystem,
  status: TokenLoginStatus,
  needsSms: boolean = false
): Promise<void> {
  await appQuery(
    'UPDATE erp_tokens SET login_status = $1, needs_sms = $2 WHERE system = $3',
    [status, needsSms, system]
  );
}

/**
 * 获取指定系统的 Token 值（快捷方法）
 */
export async function getTokenValue(system: TokenSystem): Promise<string | null> {
  const record = await getTokenRecord(system);
  return record?.token_value || null;
}

/**
 * 获取 WMS 设备 Token（辅助值）
 */
export async function getWmsDeviceToken(): Promise<string | null> {
  const record = await getTokenRecord('wms');
  return record?.token_secondary || null;
}

// ==================== token_operation_logs 写入 ====================

/**
 * 记录 Token 操作日志
 */
export async function logOperation(params: LogOperationParams): Promise<void> {
  try {
    await appQuery(
      `INSERT INTO token_operation_logs (system, operation, status, operator_id, detail, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.system,
        params.operation,
        params.status,
        params.operatorId || null,
        params.detail ? JSON.stringify(params.detail) : null,
        params.durationMs || null,
      ]
    );
  } catch (error) {
    // 日志写入失败不应影响主流程
    console.error('[TokenRepository] 操作日志写入失败:', error);
  }
}

/**
 * 查询操作日志（分页）
 */
export async function getOperationLogs(params: {
  page: number;
  pageSize: number;
  system?: TokenSystem;
}): Promise<{ rows: any[]; total: number }> {
  const { page, pageSize, system } = params;
  const offset = (page - 1) * pageSize;

  let whereClause = '';
  const queryParams: any[] = [];

  if (system) {
    whereClause = 'WHERE system = $1';
    queryParams.push(system);
  }

  const countResult = await appQuery(
    `SELECT COUNT(*) FROM token_operation_logs ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const paramOffset = queryParams.length;
  queryParams.push(pageSize, offset);

  const result = await appQuery(
    `SELECT * FROM token_operation_logs ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramOffset + 1} OFFSET $${paramOffset + 2}`,
    queryParams
  );

  return { rows: result.rows, total };
}

/**
 * 获取各系统最近一次成功登录时间
 * 使用 DISTINCT ON 一次查询每个 system 的最新成功登录记录
 */
export async function getLastLoginTimes(): Promise<Record<string, string | null>> {
  const result = await appQuery(
    `SELECT DISTINCT ON (system) system, created_at
     FROM token_operation_logs
     WHERE operation = 'login' AND status = 'success'
     ORDER BY system, created_at DESC`
  );
  const map: Record<string, string | null> = { erp: null, wms: null, b2b: null };
  for (const row of result.rows) {
    map[row.system] = new Date(row.created_at).toISOString();
  }
  return map;
}
