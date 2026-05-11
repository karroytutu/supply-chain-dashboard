/**
 * 统一考核管理 - Repository 数据访问层
 * 负责 SQL 查询和缓存管理，Service 层不直接编写 SQL
 */

import { appQuery as query, getAppClient } from '../../db/appPool';
import { cache, CACHE_TTL } from '../../utils/cache';
import type { AssessmentRecordRow, AssessmentQueryParams, AssessmentStatsRow } from './assessment.types';
import { normalizeAssessmentRole } from './assessment.types';

// ==================== 缓存配置 ====================

/** 缓存 key 前缀 */
const CACHE_PREFIX = 'assessment:';

/**
 * 生成标准化缓存 key
 * 将参数键名统一为 snake_case 并排序，确保相同查询参数生成一致的 key
 * @param prefix 业务前缀（如 records, stats, detail）
 * @param params 查询参数对象
 */
function generateCacheKey(prefix: string, params: Record<string, unknown>): string {
  const normalized = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k.replace(/([A-Z])/g, '_$1').toLowerCase(), v])
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .reduce<Record<string, unknown>>((acc, [k, v]) => ({ ...acc, [String(k)]: v }), {});
  return `${CACHE_PREFIX}${prefix}:${JSON.stringify(normalized)}`;
}

/**
 * 清除所有考核相关缓存
 * 写入操作后必须调用，确保数据一致性
 */
function invalidateCache(): void {
  cache.invalidate(CACHE_PREFIX);
}

// ==================== 查询方法 ====================

/**
 * 获取考核记录列表（分页）
 * 支持 category, status, rule_type, role, keyword, date_range 筛选
 * @param params 查询参数
 */
export async function getRecords(
  params: AssessmentQueryParams
): Promise<{ rows: AssessmentRecordRow[]; total: number }> {
  const cacheKey = generateCacheKey('records', params as unknown as Record<string, unknown>);
  const cached = cache.get<{ rows: AssessmentRecordRow[]; total: number }>(cacheKey);
  if (cached) return cached;

  const { conditions, values } = buildWhereClause(params);
  const offset = (params.page - 1) * params.page_size;

  const countSql = `SELECT COUNT(*) FROM assessment_records ${conditions}`;
  const dataSql = `
    SELECT * FROM assessment_records ${conditions}
    ORDER BY created_at DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `;

  const [countResult, dataResult] = await Promise.all([
    query(countSql, values),
    query(dataSql, [...values, params.page_size, offset]),
  ]);

  const result = {
    rows: dataResult.rows as AssessmentRecordRow[],
    total: parseInt(countResult.rows[0].count, 10),
  };

  cache.set(cacheKey, result, CACHE_TTL.HIGH_FREQUENCY);
  return result;
}

/**
 * 获取统计数据
 * @param category 可选分类筛选
 */
export async function getStats(category?: string): Promise<AssessmentStatsRow> {
  const cacheKey = generateCacheKey('stats', { category: category || 'all' });
  const cached = cache.get<AssessmentStatsRow>(cacheKey);
  if (cached) return cached;

  const categoryClause = category ? 'WHERE category = $1' : '';
  const categoryParams = category ? [category] : [];

  const sql = `
    SELECT
      COALESCE(SUM(penalty_amount), 0) AS total_amount,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
      COALESCE(SUM(penalty_amount) FILTER (WHERE status = 'pending'), 0) AS pending_amount,
      COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_count,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today_new,
      COUNT(DISTINCT assessment_user_id) FILTER (WHERE status = 'pending') AS involved_users
    FROM assessment_records
    ${categoryClause}
  `;

  const result = await query(sql, categoryParams);
  const stats: AssessmentStatsRow = result.rows[0];

  cache.set(cacheKey, stats, CACHE_TTL.DASHBOARD);
  return stats;
}

/**
 * 获取我的考核记录（指定用户）
 * @param userId 被考核用户 ID
 * @param params 查询参数
 */
export async function getMyRecords(
  userId: number,
  params: AssessmentQueryParams
): Promise<{ rows: AssessmentRecordRow[]; total: number }> {
  const cacheKey = generateCacheKey('my-records', { userId, ...params } as unknown as Record<string, unknown>);
  const cached = cache.get<{ rows: AssessmentRecordRow[]; total: number }>(cacheKey);
  if (cached) return cached;

  const { conditions, values } = buildWhereClause(params, userId);
  const offset = (params.page - 1) * params.page_size;

  const countSql = `SELECT COUNT(*) FROM assessment_records ${conditions}`;
  const dataSql = `
    SELECT * FROM assessment_records ${conditions}
    ORDER BY created_at DESC
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `;

  const [countResult, dataResult] = await Promise.all([
    query(countSql, values),
    query(dataSql, [...values, params.page_size, offset]),
  ]);

  const result = {
    rows: dataResult.rows as AssessmentRecordRow[],
    total: parseInt(countResult.rows[0].count, 10),
  };

  cache.set(cacheKey, result, CACHE_TTL.HIGH_FREQUENCY);
  return result;
}

/**
 * 获取单条考核记录详情
 * @param id 记录 ID
 */
export async function getById(id: number): Promise<AssessmentRecordRow | null> {
  const cacheKey = `${CACHE_PREFIX}detail:${id}`;
  const cached = cache.get<AssessmentRecordRow>(cacheKey);
  if (cached) return cached;

  const result = await query('SELECT * FROM assessment_records WHERE id = $1', [id]);
  const row = (result.rows[0] as AssessmentRecordRow) || null;

  if (row) {
    cache.set(cacheKey, row, CACHE_TTL.DASHBOARD);
  }
  return row;
}

// ==================== 写入方法 ====================

/**
 * 新增或更新考核记录（Upsert）
 * 仅在状态为 pending 时更新已有记录，已确认/已申诉的记录不会被覆盖
 * @param data 考核记录数据
 */
export async function upsertRecord(data: {
  category: string;
  rule_type: string;
  source_type: string;
  source_id: number;
  source_no: string;
  source_name: string;
  assessment_user_id: number;
  assessment_user_name: string;
  assessment_role: string;
  base_amount: number | null;
  penalty_rate: number | null;
  overdue_days: number;
  penalty_amount: number;
  rule_snapshot: Record<string, unknown>;
}): Promise<AssessmentRecordRow> {
  const sql = `
    INSERT INTO assessment_records (
      category, rule_type, source_type, source_id, source_no, source_name,
      assessment_user_id, assessment_user_name, assessment_role,
      base_amount, penalty_rate, overdue_days, penalty_amount,
      rule_snapshot, calculated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
    ON CONFLICT (source_id, source_type, rule_type, assessment_user_id)
    DO UPDATE SET
      source_no = EXCLUDED.source_no,
      source_name = EXCLUDED.source_name,
      assessment_user_name = EXCLUDED.assessment_user_name,
      base_amount = EXCLUDED.base_amount,
      penalty_rate = EXCLUDED.penalty_rate,
      overdue_days = EXCLUDED.overdue_days,
      penalty_amount = EXCLUDED.penalty_amount,
      rule_snapshot = EXCLUDED.rule_snapshot,
      calculated_at = NOW(),
      updated_at = NOW()
    WHERE assessment_records.status = 'pending'
    RETURNING *
  `;

  const values = [
    data.category, data.rule_type, data.source_type, data.source_id,
    data.source_no, data.source_name, data.assessment_user_id,
    data.assessment_user_name, normalizeAssessmentRole(data.assessment_role), data.base_amount,
    data.penalty_rate, data.overdue_days, data.penalty_amount,
    JSON.stringify(data.rule_snapshot),
  ];

  const result = await query(sql, values);
  invalidateCache();
  return result.rows[0] as AssessmentRecordRow;
}

/**
 * 更新考核记录状态（确认/取消）
 * @param id 记录 ID
 * @param status 目标状态
 * @param handledBy 处理人用户 ID
 * @param remark 处理备注
 */
export async function updateStatus(
  id: number,
  status: string,
  handledBy: number,
  remark?: string
): Promise<AssessmentRecordRow | null> {
  const sql = `
    UPDATE assessment_records
    SET status = $1, handled_by = $2, handled_at = NOW(),
        handle_remark = $3, updated_at = NOW()
    WHERE id = $4
    RETURNING *
  `;

  const result = await query(sql, [status, handledBy, remark || null, id]);
  invalidateCache();
  return (result.rows[0] as AssessmentRecordRow) || null;
}

/**
 * 更新申诉状态（由 OA 回调或申诉提交调用）
 * 动态构建 SET 子句，仅更新传入的字段
 * @param id 记录 ID
 * @param data 申诉相关字段
 */
export async function updateAppealStatus(
  id: number,
  data: {
    status: string;
    oa_instance_id?: number;
    appeal_reason?: string;
    appeal_submitted_at?: string;
    handle_remark?: string;
    handled_by?: number;
  }
): Promise<AssessmentRecordRow | null> {
  const setClauses: string[] = ['status = $1', 'updated_at = NOW()'];
  const values: unknown[] = [data.status];
  let paramIndex = 2;

  if (data.oa_instance_id !== undefined) {
    setClauses.push(`oa_instance_id = $${paramIndex++}`);
    values.push(data.oa_instance_id);
  }
  if (data.appeal_reason !== undefined) {
    setClauses.push(`appeal_reason = $${paramIndex++}`);
    values.push(data.appeal_reason);
  }
  if (data.appeal_submitted_at !== undefined) {
    setClauses.push(`appeal_submitted_at = $${paramIndex++}`);
    values.push(data.appeal_submitted_at);
  }
  if (data.handle_remark !== undefined) {
    setClauses.push(`handle_remark = $${paramIndex++}`);
    values.push(data.handle_remark);
  }
  if (data.handled_by !== undefined) {
    setClauses.push(`handled_by = $${paramIndex++}`);
    setClauses.push('handled_at = NOW()');
    values.push(data.handled_by);
  }

  values.push(id);
  const sql = `
    UPDATE assessment_records
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await query(sql, values);
  invalidateCache();
  return (result.rows[0] as AssessmentRecordRow) || null;
}

/**
 * 批量新增/更新考核记录（用于计算引擎批量写入）
 * 使用事务保证原子性，逐条 upsert 后统一提交
 * @param records 考核记录数组
 * @returns 成功插入/更新的记录数
 */
export async function batchUpsertRecords(
  records: Array<{
    category: string;
    rule_type: string;
    source_type: string;
    source_id: number;
    source_no: string;
    source_name: string;
    assessment_user_id: number;
    assessment_user_name: string;
    assessment_role: string;
    base_amount: number | null;
    penalty_rate: number | null;
    overdue_days: number;
    penalty_amount: number;
    rule_snapshot: Record<string, unknown>;
  }>
): Promise<number> {
  if (records.length === 0) return 0;

  const client = await getAppClient();
  let successCount = 0;

  try {
    await client.query('BEGIN');

    const sql = `
      INSERT INTO assessment_records (
        category, rule_type, source_type, source_id, source_no, source_name,
        assessment_user_id, assessment_user_name, assessment_role,
        base_amount, penalty_rate, overdue_days, penalty_amount,
        rule_snapshot, calculated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (source_id, source_type, rule_type, assessment_user_id)
      DO UPDATE SET
        source_no = EXCLUDED.source_no,
        source_name = EXCLUDED.source_name,
        assessment_user_name = EXCLUDED.assessment_user_name,
        base_amount = EXCLUDED.base_amount,
        penalty_rate = EXCLUDED.penalty_rate,
        overdue_days = EXCLUDED.overdue_days,
        penalty_amount = EXCLUDED.penalty_amount,
        rule_snapshot = EXCLUDED.rule_snapshot,
        calculated_at = NOW(),
        updated_at = NOW()
      WHERE assessment_records.status = 'pending'
      RETURNING id
    `;

    for (const record of records) {
      const values = [
        record.category, record.rule_type, record.source_type, record.source_id,
        record.source_no, record.source_name, record.assessment_user_id,
        record.assessment_user_name, normalizeAssessmentRole(record.assessment_role), record.base_amount,
        record.penalty_rate, record.overdue_days, record.penalty_amount,
        JSON.stringify(record.rule_snapshot),
      ];
      const result = await client.query(sql, values);
      successCount += result.rowCount || 0;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  invalidateCache();
  return successCount;
}

/**
 * 取消指定来源的 pending 考核记录
 * 用于营业执照补交后取消对应的待处理考核
 * @param sourceId 来源ID（如 deferred_upload.id）
 * @param sourceType 来源类型（如 'credit_license_deferred'）
 */
export async function cancelPendingBySource(sourceId: number, sourceType: string): Promise<number> {
  const result = await query(
    `UPDATE assessment_records
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE source_id = $1 AND source_type = $2 AND status = 'pending'`,
    [sourceId, sourceType]
  );

  if (result.rowCount && result.rowCount > 0) {
    invalidateCache();
  }
  return result.rowCount || 0;
}

// ==================== 内部工具函数 ====================

/**
 * 构建动态 WHERE 子句
 * @param params 查询参数
 * @param userId 可选，指定被考核用户 ID（用于"我的考核"）
 */
function buildWhereClause(
  params: AssessmentQueryParams,
  userId?: number
): { conditions: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (userId !== undefined) {
    clauses.push(`assessment_user_id = $${paramIndex++}`);
    values.push(userId);
  }

  if (params.category) {
    clauses.push(`category = $${paramIndex++}`);
    values.push(params.category);
  }

  if (params.status) {
    clauses.push(`status = $${paramIndex++}`);
    values.push(params.status);
  }

  if (params.rule_type) {
    clauses.push(`rule_type = $${paramIndex++}`);
    values.push(params.rule_type);
  }

  if (params.role) {
    clauses.push(`assessment_role = $${paramIndex++}`);
    values.push(params.role);
  }

  if (params.keyword) {
    clauses.push(`(
      source_no ILIKE $${paramIndex} OR
      source_name ILIKE $${paramIndex} OR
      assessment_user_name ILIKE $${paramIndex}
    )`);
    values.push(`%${params.keyword}%`);
    paramIndex++;
  }

  if (params.start_date) {
    clauses.push(`created_at >= $${paramIndex++}`);
    values.push(params.start_date);
  }

  if (params.end_date) {
    clauses.push(`created_at < $${paramIndex++}`);
    values.push(params.end_date);
  }

  const conditions = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return { conditions, values };
}
