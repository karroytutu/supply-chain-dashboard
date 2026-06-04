/**
 * 客户授信营业执照后补上传 - 数据访问层
 * @module services/credit-license/credit-license.repository
 */

import { appQuery } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import type {
  CreditLicenseDeferredRow,
  CreateDeferredUploadParams,
  CreditLicenseQueryParams,
} from './credit-license.types';

const CACHE_PREFIX = 'credit:license:deferred:';

function invalidateCache(): void {
  cache.invalidate(CACHE_PREFIX);
}

/**
 * 根据审批实例ID查延期补交记录
 */
export async function getByInstanceId(
  oaInstanceId: number
): Promise<CreditLicenseDeferredRow | null> {
  const cacheKey = `${CACHE_PREFIX}instance:${oaInstanceId}`;
  const cached = cache.get<CreditLicenseDeferredRow>(cacheKey);
  if (cached) return cached;

  const result = await appQuery<CreditLicenseDeferredRow>(
    'SELECT * FROM credit_license_deferred_uploads WHERE oa_instance_id = $1',
    [oaInstanceId]
  );

  const row = result.rows[0] || null;
  if (row) {
    cache.set(cacheKey, row, CACHE_TTL.HIGH_FREQUENCY);
  }
  return row;
}

/**
 * 查询需要提醒的记录（指定截止日期范围的 pending/reminded 记录）
 */
export async function getPendingReminders(
  deadlineStart: Date,
  deadlineEnd: Date
): Promise<CreditLicenseDeferredRow[]> {
  const result = await appQuery<CreditLicenseDeferredRow>(
    `SELECT * FROM credit_license_deferred_uploads
     WHERE status IN ('pending', 'reminded')
       AND deadline >= $1 AND deadline <= $2`,
    [deadlineStart, deadlineEnd]
  );
  return result.rows;
}

/**
 * 查询已过期的记录（需标记为 overdue）
 */
export async function getOverdueRecords(): Promise<CreditLicenseDeferredRow[]> {
  const result = await appQuery<CreditLicenseDeferredRow>(
    `SELECT * FROM credit_license_deferred_uploads
     WHERE status IN ('pending', 'reminded')
       AND deadline < CURRENT_TIMESTAMP`
  );
  return result.rows;
}

/**
 * 查询所有逾期状态记录（供考核计算使用）
 */
export async function getOverdueAssessmentTargets(): Promise<CreditLicenseDeferredRow[]> {
  const result = await appQuery<CreditLicenseDeferredRow>(
    `SELECT * FROM credit_license_deferred_uploads
     WHERE status = 'overdue'`
  );
  return result.rows;
}

/**
 * 创建延期补交记录
 */
export async function create(data: CreateDeferredUploadParams): Promise<CreditLicenseDeferredRow> {
  const result = await appQuery<CreditLicenseDeferredRow>(
    `INSERT INTO credit_license_deferred_uploads
       (oa_instance_id, customer_id, customer_name, applicant_id, applicant_name, deadline)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.oaInstanceId,
      data.customerId,
      data.customerName,
      data.applicantId,
      data.applicantName,
      data.deadline,
    ]
  );

  invalidateCache();
  return result.rows[0];
}

/**
 * 更新状态
 */
export async function updateStatus(
  id: number,
  status: string,
  extraFields?: Record<string, unknown>
): Promise<CreditLicenseDeferredRow | null> {
  const setClauses: string[] = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
  const params: unknown[] = [id, status];
  let paramIdx = 3;

  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      setClauses.push(`${key} = $${paramIdx}`);
      params.push(value);
      paramIdx++;
    }
  }

  const result = await appQuery<CreditLicenseDeferredRow>(
    `UPDATE credit_license_deferred_uploads SET ${setClauses.join(', ')} WHERE id = $1
     RETURNING *`,
    params
  );

  invalidateCache();
  return result.rows[0] || null;
}

/**
 * 批量标记过期
 */
export async function markOverdueBatch(): Promise<number> {
  const result = await appQuery(
    `UPDATE credit_license_deferred_uploads
     SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
     WHERE status IN ('pending', 'reminded')
       AND deadline < CURRENT_TIMESTAMP`
  );

  if (result.rowCount && result.rowCount > 0) {
    invalidateCache();
  }
  return result.rowCount || 0;
}

/**
 * 查询营销员的待补交列表（分页）
 */
export async function getByApplicant(
  applicantId: number,
  params: CreditLicenseQueryParams
): Promise<{ rows: CreditLicenseDeferredRow[]; total: number }> {
  const conditions: string[] = ['applicant_id = $1'];
  const queryParams: unknown[] = [applicantId];
  let paramIdx = 2;

  if (params.status) {
    conditions.push(`status = $${paramIdx}`);
    queryParams.push(params.status);
    paramIdx++;
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await appQuery<{ count: string }>(
    `SELECT COUNT(*) as count FROM credit_license_deferred_uploads WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0]?.count || '0', 10);

  const offset = (params.page - 1) * params.pageSize;
  const result = await appQuery<CreditLicenseDeferredRow>(
    `SELECT * FROM credit_license_deferred_uploads WHERE ${whereClause}
     ORDER BY deadline ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...queryParams, params.pageSize, offset]
  );

  return { rows: result.rows, total };
}

/**
 * 查询所有延期补交列表（管理视图，分页）
 */
export async function getAll(
  params: CreditLicenseQueryParams
): Promise<{ rows: CreditLicenseDeferredRow[]; total: number }> {
  const conditions: string[] = [];
  const queryParams: unknown[] = [];
  let paramIdx = 1;

  if (params.status) {
    conditions.push(`status = $${paramIdx}`);
    queryParams.push(params.status);
    paramIdx++;
  }

  if (params.applicantId) {
    conditions.push(`applicant_id = $${paramIdx}`);
    queryParams.push(params.applicantId);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await appQuery<{ count: string }>(
    `SELECT COUNT(*) as count FROM credit_license_deferred_uploads ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0]?.count || '0', 10);

  const offset = (params.page - 1) * params.pageSize;
  const result = await appQuery<CreditLicenseDeferredRow>(
    `SELECT * FROM credit_license_deferred_uploads ${whereClause}
     ORDER BY deadline ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...queryParams, params.pageSize, offset]
  );

  return { rows: result.rows, total };
}
