/**
 * OA节点时限 - 数据访问层
 * @module services/oa/timeout/oa-timeout.repository
 */

import { createLogger } from '../../../utils/logger';
const log = createLogger('OaTimeout');

import { appQuery as query } from '../../../db/appPool';
import { toCamelKeys } from '../../../utils/keyConvert';
import type { OaNodeRow } from '../oa.types';
import type { OverdueNode, TimeoutLogEntry } from './oa-timeout.types';

// =====================================================
// 催办扫描查询
// =====================================================

/**
 * 获取配置了 reminder 的超时 pending 节点
 * 只查询 timeout_config 中有 reminder 配置的节点
 */
export async function getOverdueNodesWithReminder(): Promise<OverdueNode[]> {
  const result = await query<OverdueNode>(
    `SELECT DISTINCT ON (n.instance_id, n.node_order)
       n.*,
       i.instance_no,
       i.title,
       ft.name AS form_type_name,
       u.name AS first_assigned_user_name
     FROM oa_approval_nodes n
     JOIN oa_approval_instances i ON i.id = n.instance_id
     JOIN oa_form_types ft ON ft.id = i.form_type_id
     LEFT JOIN users u ON u.id = n.assigned_user_ids[1]
     WHERE n.status = 'pending'
       AND n.deadline_at IS NOT NULL
       AND n.deadline_at < NOW()
       AND n.timeout_config IS NOT NULL
       AND n.timeout_config->'reminder' IS NOT NULL
     ORDER BY n.instance_id, n.node_order, n.round DESC`,
    []
  );
  // DISTINCT ON 要求 ORDER BY 前置列，此处按 deadline_at 重新排序
  return result.rows.sort((a, b) => new Date(a.deadline_at!).getTime() - new Date(b.deadline_at!).getTime());
}

/**
 * 获取配置了 assessment 的超时 pending 节点（用于考核计算）
 */
export async function getOverdueNodesWithAssessment(): Promise<OverdueNode[]> {
  const result = await query<OverdueNode>(
    `SELECT DISTINCT ON (n.instance_id, n.node_order)
       n.*,
       i.instance_no,
       i.title,
       ft.name AS form_type_name,
       u.name AS first_assigned_user_name
     FROM oa_approval_nodes n
     JOIN oa_approval_instances i ON i.id = n.instance_id
     JOIN oa_form_types ft ON ft.id = i.form_type_id
     LEFT JOIN users u ON u.id = n.assigned_user_ids[1]
     WHERE n.status = 'pending'
       AND n.deadline_at IS NOT NULL
       AND n.deadline_at < NOW()
       AND n.timeout_config IS NOT NULL
       AND n.timeout_config->'assessment' IS NOT NULL
     ORDER BY n.instance_id, n.node_order, n.round DESC`,
    []
  );
  return result.rows.sort((a, b) => new Date(a.deadline_at!).getTime() - new Date(b.deadline_at!).getTime());
}

// =====================================================
// 催办状态更新
// =====================================================

/**
 * 更新催办状态（催办后调用）
 */
export async function updateReminderState(
  nodeId: number,
  updates: {
    last_reminder_at?: Date;
    reminder_count?: number;
    cc_supervisor_at?: Date;
  }
): Promise<void> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.last_reminder_at !== undefined) {
    setClauses.push(`last_reminder_at = $${idx++}`);
    params.push(updates.last_reminder_at);
  }
  if (updates.reminder_count !== undefined) {
    setClauses.push(`reminder_count = $${idx++}`);
    params.push(updates.reminder_count);
  }
  if (updates.cc_supervisor_at !== undefined) {
    setClauses.push(`cc_supervisor_at = $${idx++}`);
    params.push(updates.cc_supervisor_at);
  }

  if (setClauses.length === 0) return;

  params.push(nodeId);
  await query(
    `UPDATE oa_approval_nodes SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
    params
  );
}

// =====================================================
// 催办日志
// =====================================================

/**
 * 插入催办日志
 */
export async function insertTimeoutLog(entry: TimeoutLogEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO oa_node_timeout_logs
         (node_id, instance_id, log_type, recipient_user_id, recipient_user_name, is_supervisor_cc, message_content)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.node_id,
        entry.instance_id,
        entry.log_type,
        entry.recipient_user_id,
        entry.recipient_user_name,
        entry.is_supervisor_cc,
        entry.message_content ? JSON.stringify(entry.message_content) : null,
      ]
    );
  } catch (error) {
    log.error('写入催办日志失败:', error);
    // 日志写入失败不阻塞主流程
  }
}

/**
 * 获取实例的催办日志列表（返回 camelCase）
 */
export async function getTimeoutLogs(instanceId: number): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT node_id, instance_id, log_type, recipient_user_id, recipient_user_name,
            is_supervisor_cc, message_content, created_at
     FROM oa_node_timeout_logs
     WHERE instance_id = $1
     ORDER BY created_at DESC`,
    [instanceId]
  );
  return result.rows.map(r => toCamelKeys(r));
}


