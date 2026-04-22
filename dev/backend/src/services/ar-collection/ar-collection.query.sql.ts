/**
 * 催收查询 SQL 片段
 */

/** pendingRole 计算 SQL 片段 */
export const PENDING_ROLE_SQL = `
  CASE
    WHEN t.status = 'collecting' OR t.status = 'extension' THEN 'marketer'
    WHEN t.status = 'escalated' AND t.escalation_level = 1 THEN 'supervisor'
    WHEN t.status = 'difference_processing' THEN 'finance'
    WHEN t.status = 'escalated' AND t.escalation_level = 2 THEN 'finance'
    WHEN t.status = 'pending_verify' THEN 'cashier'
    ELSE NULL
  END AS pending_role`;

/** 考核层级子查询 SQL 片段 */
export const ASSESSMENT_TIERS_SQL = `(
  SELECT array_agg(DISTINCT assessment_tier)
  FROM ar_assessment_records
  WHERE task_id = t.id
) AS assessment_tiers`;
