/** @deprecated 已迁移到统一考核模块 services/assessment/，请勿继续使用此文件 */
/**
 * 催收考核管理 - CRUD 查询服务
 */

import { appQuery } from '../../db/appPool';
import {
  TIER_NAMES,
  type AssessmentRecord,
  type AssessmentQueryParams,
  type AssessmentListResult,
  type AssessmentStats,
  type AssessmentTier,
  type AssessmentStatus,
} from './ar-assessment.types';

/** 数据库行映射 */
interface AssessmentRow {
  id: number;
  task_id: number;
  task_no: string;
  consumer_name: string;
  assessment_tier: AssessmentTier;
  assessment_user_id: number;
  assessment_user_name: string;
  assessment_role: string;
  base_amount: string;
  overdue_days: number;
  penalty_amount: string;
  assessment_rule_snapshot: string | null;
  status: string;
  handle_remark: string | null;
  handled_by: number | null;
  handled_at: Date | null;
  calculated_at: Date;
  created_at: Date;
  updated_at: Date;
  task_created_at: Date | null;
}

/** 行转实体 */
function mapRowToRecord(row: AssessmentRow): AssessmentRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    taskNo: row.task_no,
    consumerName: row.consumer_name,
    assessmentTier: row.assessment_tier,
    assessmentUserId: row.assessment_user_id,
    assessmentUserName: row.assessment_user_name,
    assessmentRole: row.assessment_role as AssessmentRecord['assessmentRole'],
    baseAmount: parseFloat(row.base_amount) || 0,
    overdueDays: row.overdue_days,
    penaltyAmount: parseFloat(row.penalty_amount) || 0,
    assessmentRuleSnapshot: row.assessment_rule_snapshot
      ? (typeof row.assessment_rule_snapshot === 'string'
        ? JSON.parse(row.assessment_rule_snapshot)
        : row.assessment_rule_snapshot)
      : null,
    status: row.status as AssessmentStatus,
    handleRemark: row.handle_remark,
    handledBy: row.handled_by,
    handledAt: row.handled_at,
    calculatedAt: row.calculated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    taskCreateTime: row.task_created_at,
  };
}

/**
 * 获取考核记录列表
 * 已适配统一考核表 assessment_records
 */
export async function getAssessments(
  params: AssessmentQueryParams
): Promise<AssessmentListResult> {
  const {
    page = 1,
    pageSize = 20,
    assessmentTier,
    assessmentUserId,
    assessmentRole,
    status,
    startDate,
    endDate,
    keyword,
  } = params;

  const offset = (page - 1) * pageSize;
  const conditions: string[] = ['a.source_type = \'ar_collection_task\''];
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (assessmentTier) {
    conditions.push(`a.rule_type = $${paramIndex++}`);
    queryParams.push(assessmentTier);
  }

  if (assessmentUserId) {
    conditions.push(`a.assessment_user_id = $${paramIndex++}`);
    queryParams.push(assessmentUserId);
  }

  if (assessmentRole) {
    conditions.push(`a.assessment_role = $${paramIndex++}`);
    queryParams.push(assessmentRole);
  }

  if (status) {
    // 适配新表状态名：handled→confirmed, skipped→cancelled
    const mappedStatus = status === 'handled' ? 'confirmed' : status === 'skipped' ? 'cancelled' : status;
    conditions.push(`a.status = $${paramIndex++}`);
    queryParams.push(mappedStatus);
  }

  if (startDate) {
    conditions.push(`a.created_at >= $${paramIndex++}`);
    queryParams.push(startDate);
  }

  if (endDate) {
    conditions.push(`a.created_at <= $${paramIndex++}::timestamp + interval '1 day'`);
    queryParams.push(endDate);
  }

  if (keyword) {
    conditions.push(
      `(a.source_no ILIKE $${paramIndex} OR a.source_name ILIKE $${paramIndex} OR a.assessment_user_name ILIKE $${paramIndex})`
    );
    queryParams.push(`%${keyword}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  // 查询总数
  const countResult = await appQuery<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM assessment_records a
     WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0]?.count || '0');

  // 查询列表
  const result = await appQuery<AssessmentRow>(
    `SELECT
      a.id,
      a.source_id AS task_id,
      a.source_no AS task_no,
      a.source_name AS consumer_name,
      a.rule_type AS assessment_tier,
      a.assessment_user_id,
      a.assessment_user_name,
      a.assessment_role,
      a.base_amount,
      a.overdue_days,
      a.penalty_amount,
      a.rule_snapshot AS assessment_rule_snapshot,
      a.status,
      a.handle_remark,
      a.handled_by,
      a.handled_at,
      a.calculated_at,
      a.created_at,
      a.updated_at,
      t.created_at AS task_created_at
    FROM assessment_records a
    LEFT JOIN ar_collection_tasks t ON a.source_id = t.id
    WHERE ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...queryParams, pageSize, offset]
  );

  const data = result.rows.map(mapRowToRecord);

  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

/**
 * 获取我的考核记录
 */
export async function getMyAssessments(
  userId: number,
  params: { page?: number; pageSize?: number; status?: string }
): Promise<AssessmentListResult> {
  return getAssessments({
    ...params,
    status: params.status as AssessmentStatus | undefined,
    assessmentUserId: userId,
  });
}

/**
 * 获取单条考核记录
 * 已适配统一考核表 assessment_records
 */
export async function getAssessmentById(id: number): Promise<AssessmentRecord | null> {
  const result = await appQuery<AssessmentRow>(
    `SELECT
      a.id,
      a.source_id AS task_id,
      a.source_no AS task_no,
      a.source_name AS consumer_name,
      a.rule_type AS assessment_tier,
      a.assessment_user_id,
      a.assessment_user_name,
      a.assessment_role,
      a.base_amount,
      a.overdue_days,
      a.penalty_amount,
      a.rule_snapshot AS assessment_rule_snapshot,
      a.status,
      a.handle_remark,
      a.handled_by,
      a.handled_at,
      a.calculated_at,
      a.created_at,
      a.updated_at,
      t.created_at AS task_created_at
    FROM assessment_records a
    LEFT JOIN ar_collection_tasks t ON a.source_id = t.id
    WHERE a.id = $1 AND a.source_type = 'ar_collection_task'`,
    [id]
  );

  if (result.rows.length === 0) return null;
  return mapRowToRecord(result.rows[0]);
}

/**
 * 获取考核统计数据
 * 已适配统一考核表 assessment_records
 */
export async function getAssessmentStats(): Promise<AssessmentStats> {
  const baseStatsResult = await appQuery<{
    total_amount: string;
    pending_count: string;
    pending_amount: string;
    handled_count: string;
    handled_amount: string;
    skipped_count: string;
    skipped_amount: string;
    user_count: string;
    today_count: string;
    today_amount: string;
  }>(
    `SELECT
      COALESCE(SUM(penalty_amount), 0) as total_amount,
      COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0) as pending_count,
      COALESCE(SUM(penalty_amount) FILTER (WHERE status = 'pending'), 0) as pending_amount,
      COALESCE(COUNT(*) FILTER (WHERE status = 'confirmed'), 0) as handled_count,
      COALESCE(SUM(penalty_amount) FILTER (WHERE status = 'confirmed'), 0) as handled_amount,
      COALESCE(COUNT(*) FILTER (WHERE status = 'cancelled'), 0) as skipped_count,
      COALESCE(SUM(penalty_amount) FILTER (WHERE status = 'cancelled'), 0) as skipped_amount,
      COALESCE(COUNT(DISTINCT assessment_user_id), 0) as user_count,
      COALESCE(COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE), 0) as today_count,
      COALESCE(SUM(penalty_amount) FILTER (WHERE created_at::date = CURRENT_DATE), 0) as today_amount
    FROM assessment_records
    WHERE source_type = 'ar_collection_task'`
  );

  const baseStats = baseStatsResult.rows[0];

  // 按层级统计
  const byTierResult = await appQuery<{
    tier: AssessmentTier;
    count: string;
    amount: string;
  }>(
    `SELECT
      rule_type as tier,
      COUNT(*) as count,
      COALESCE(SUM(penalty_amount), 0) as amount
    FROM assessment_records
    WHERE source_type = 'ar_collection_task'
    GROUP BY rule_type
    ORDER BY amount DESC`
  );

  const byTier = byTierResult.rows.map(row => ({
    tier: row.tier,
    tierName: TIER_NAMES[row.tier] || row.tier,
    count: parseInt(row.count),
    amount: parseFloat(row.amount),
  }));

  return {
    totalAmount: parseFloat(baseStats?.total_amount || '0'),
    pendingCount: parseInt(baseStats?.pending_count || '0'),
    pendingAmount: parseFloat(baseStats?.pending_amount || '0'),
    handledCount: parseInt(baseStats?.handled_count || '0'),
    handledAmount: parseFloat(baseStats?.handled_amount || '0'),
    skippedCount: parseInt(baseStats?.skipped_count || '0'),
    skippedAmount: parseFloat(baseStats?.skipped_amount || '0'),
    userCount: parseInt(baseStats?.user_count || '0'),
    todayCount: parseInt(baseStats?.today_count || '0'),
    todayAmount: parseFloat(baseStats?.today_amount || '0'),
    byTier,
  };
}

/**
 * 更新考核处理状态
 * 已适配统一考核表 assessment_records
 * @param id 记录ID
 * @param status 新状态（handled | skipped）- 会映射为新表状态（confirmed | cancelled）
 * @param remark 处理备注（skipped 时必填）
 * @param handledBy 处理人ID
 */
export async function updateAssessmentHandleStatus(
  id: number,
  status: 'handled' | 'skipped',
  remark: string | null,
  handledBy: number
): Promise<AssessmentRecord | null> {
  // 适配新表状态名：handled→confirmed, skipped→cancelled
  const mappedStatus = status === 'handled' ? 'confirmed' : status === 'skipped' ? 'cancelled' : status;
  const result = await appQuery<any>(
    `UPDATE assessment_records
     SET status = $1,
         handle_remark = $2,
         handled_by = $3,
         handled_at = NOW(),
         updated_at = NOW()
     WHERE id = $4
       AND status = 'pending'
       AND source_type = 'ar_collection_task'
     RETURNING id, source_id, source_no, source_name, rule_type,
       assessment_user_id, assessment_user_name, assessment_role,
       base_amount, overdue_days, penalty_amount, rule_snapshot,
       status, handle_remark, handled_by, handled_at,
       calculated_at, created_at, updated_at`,
    [mappedStatus, remark, handledBy, id]
  );

  if (result.rows.length === 0) return null;

  // 将新表字段映射为旧接口格式
  const row = result.rows[0];
  const mappedRow: AssessmentRow = {
    id: row.id,
    task_id: row.source_id,
    task_no: row.source_no,
    consumer_name: row.source_name,
    assessment_tier: row.rule_type,
    assessment_user_id: row.assessment_user_id,
    assessment_user_name: row.assessment_user_name,
    assessment_role: row.assessment_role,
    base_amount: row.base_amount,
    overdue_days: row.overdue_days,
    penalty_amount: row.penalty_amount,
    assessment_rule_snapshot: row.rule_snapshot,
    status: row.status === 'confirmed' ? 'handled' : row.status === 'cancelled' ? 'skipped' : row.status,
    handle_remark: row.handle_remark,
    handled_by: row.handled_by,
    handled_at: row.handled_at,
    calculated_at: row.calculated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    task_created_at: null,
  };

  // 补充任务创建时间
  const taskResult = await appQuery<{ created_at: Date }>(
    `SELECT created_at FROM ar_collection_tasks WHERE id = $1`,
    [mappedRow.task_id]
  );
  if (taskResult.rows.length > 0) {
    mappedRow.task_created_at = taskResult.rows[0].created_at;
  }

  return mapRowToRecord(mappedRow);
}

/**
 * 按任务查询考核记录
 * 已适配统一考核表 assessment_records（原 ar_assessment_records 已重命名）
 */
export async function getAssessmentsByTaskId(
  taskId: number
): Promise<AssessmentRecord[]> {
  const result = await appQuery<AssessmentRow>(
    `SELECT
      a.id,
      a.source_id AS task_id,
      a.source_no AS task_no,
      a.source_name AS consumer_name,
      a.rule_type AS assessment_tier,
      a.assessment_user_id,
      a.assessment_user_name,
      a.assessment_role,
      a.base_amount,
      a.overdue_days,
      a.penalty_amount,
      a.rule_snapshot AS assessment_rule_snapshot,
      a.status,
      a.handle_remark,
      a.handled_by,
      a.handled_at,
      a.calculated_at,
      a.created_at,
      a.updated_at,
      t.created_at AS task_created_at
    FROM assessment_records a
    LEFT JOIN ar_collection_tasks t ON a.source_id = t.id
    WHERE a.source_id = $1 AND a.source_type = 'ar_collection_task'
    ORDER BY a.rule_type, a.assessment_role`,
    [taskId]
  );

  return result.rows.map(mapRowToRecord);
}
