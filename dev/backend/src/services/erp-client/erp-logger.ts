/**
 * ERP 请求日志
 * 记录每次 ERP API 调用到 erp_api_logs 表
 * @module services/erp-client/erp-logger
 */

import { randomUUID } from 'crypto';
import { appQuery } from '../../db/appPool';
import type { ErpLogEntry } from './erp-client.types';

/** 日志序列化大小上限（10KB） */
const MAX_LOG_SIZE = 10000;

/**
 * 安全 JSON 序列化，限制大小防止撑爆日志表
 * 截断时生成合法的 jsonb 值（避免 PostgreSQL jsonb 列报错）
 */
function safeStringify(data: unknown): string {
  try {
    const str = JSON.stringify(data);
    if (str.length <= MAX_LOG_SIZE) return str;
    // 截断时包装为合法 JSON 对象
    return JSON.stringify({ _truncated: true, _preview: str.substring(0, MAX_LOG_SIZE) });
  } catch {
    return JSON.stringify({ _error: 'serialize_failed' });
  }
}

/**
 * 创建日志条目（返回 requestId）
 */
export function createLogEntry(): string {
  return randomUUID();
}

/**
 * 写入 ERP API 日志到数据库
 */
export async function writeErpLog(entry: ErpLogEntry): Promise<void> {
  try {
    await appQuery(
      `INSERT INTO erp_api_logs
        (request_id, method, path, request_headers, request_body,
         response_status, response_body, error_message, duration_ms,
         retry_count, business_type, business_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        entry.requestId,
        entry.method,
        entry.path,
        entry.requestHeaders ? safeStringify(entry.requestHeaders) : null,
        entry.requestBody ? safeStringify(entry.requestBody) : null,
        entry.responseStatus ?? null,
        entry.responseBody ? safeStringify(entry.responseBody) : null,
        entry.errorMessage ?? null,
        entry.durationMs,
        entry.retryCount,
        entry.businessType ?? null,
        entry.businessId ?? null,
      ]
    );
  } catch (error: unknown) {
    // 日志写入失败不应影响业务流程
    const message = error instanceof Error ? error.message : String(error);
    console.error('[ErpLogger] 日志写入失败:', message);
  }
}
