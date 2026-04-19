/**
 * ERP 请求日志
 * 记录每次 ERP API 调用到 erp_api_logs 表
 * @module services/erp-client/erp-logger
 */

import { randomUUID } from 'crypto';
import { appQuery } from '../../db/appPool';
import type { ErpLogEntry } from './erp-client.types';

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
        entry.requestHeaders ? JSON.stringify(entry.requestHeaders) : null,
        entry.requestBody ? JSON.stringify(entry.requestBody) : null,
        entry.responseStatus ?? null,
        entry.responseBody ? JSON.stringify(entry.responseBody) : null,
        entry.errorMessage ?? null,
        entry.durationMs,
        entry.retryCount,
        entry.businessType ?? null,
        entry.businessId ?? null,
      ]
    );
  } catch (error: any) {
    // 日志写入失败不应影响业务流程
    console.error('[ErpLogger] 日志写入失败:', error.message);
  }
}
