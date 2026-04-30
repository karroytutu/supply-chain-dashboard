/**
 * 统一考核管理 - DTO 映射层
 * 负责数据库行（snake_case）与 API 响应（camelCase）之间的转换
 * 以及 DECIMAL string → number 的类型转换
 */

import type { AssessmentRecordRow, AssessmentRecordDTO, AssessmentStatsRow, AssessmentStatsDTO } from './assessment.types';

/**
 * 数据库行 → DTO（用于 API 响应）
 * - snake_case → camelCase
 * - DECIMAL string → number（base_amount, penalty_rate, penalty_amount）
 * @param row 数据库行数据
 */
export function toDTO(row: AssessmentRecordRow): AssessmentRecordDTO {
  return {
    id: row.id,
    category: row.category,
    ruleType: row.rule_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceNo: row.source_no,
    sourceName: row.source_name,
    assessmentUserId: row.assessment_user_id,
    assessmentUserName: row.assessment_user_name,
    assessmentRole: row.assessment_role,
    baseAmount: row.base_amount ? parseFloat(row.base_amount) : null,
    penaltyRate: row.penalty_rate ? parseFloat(row.penalty_rate) : null,
    overdueDays: row.overdue_days,
    penaltyAmount: parseFloat(row.penalty_amount),
    status: row.status,
    handleRemark: row.handle_remark,
    handledBy: row.handled_by,
    handledAt: row.handled_at,
    oaInstanceId: row.oa_instance_id,
    appealReason: row.appeal_reason,
    appealSubmittedAt: row.appeal_submitted_at,
    ruleSnapshot: row.rule_snapshot,
    calculatedAt: row.calculated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 批量转换数据库行 → DTO 列表
 * @param rows 数据库行数组
 */
export function toDTOList(rows: AssessmentRecordRow[]): AssessmentRecordDTO[] {
  return rows.map(toDTO);
}

/**
 * 统计数据转换（确保数值精度）
 * PostgreSQL 聚合函数返回的 NUMERIC/BIGINT 可能为 string，需统一转为 number
 * @param stats 原始统计数据
 */
export function toStatsDTO(stats: AssessmentStatsRow): AssessmentStatsDTO {
  return {
    totalAmount: parseFloat(String(stats.total_amount)) || 0,
    pendingCount: Number(stats.pending_count) || 0,
    pendingAmount: parseFloat(String(stats.pending_amount)) || 0,
    confirmedCount: Number(stats.confirmed_count) || 0,
    todayNew: Number(stats.today_new) || 0,
    involvedUsers: Number(stats.involved_users) || 0,
  };
}
