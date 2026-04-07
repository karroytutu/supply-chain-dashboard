/**
 * 超时预警服务
 * 负责检查流程节点超时情况并发送预警通知
 */

import { appQuery, getAppClient } from '../../../db/appPool';
import type { TimeoutWarningItem, FlowNodeType, OverdueLevel } from '../ar.types';
import { getWarningHours } from './deadline.service';
import { sendWorkNotification } from '../../dingtalk.service';

interface TimeoutRecord {
  nodeId: number; customerTaskId: number; taskNo: string; consumerName: string;
  overdueLevel: OverdueLevel; nodeType: FlowNodeType; deadlineAt: Date;
  collectorId: number | null; collectorName: string | null; dingtalkUserId: string | null;
}

const nodeTypeMap: Record<FlowNodeType, string> = { preprocessing: '预处理', assignment: '任务分配', collection: '催收执行', review: '结果审核' };
const overdueLevelMap: Record<OverdueLevel, string> = { light: '轻度', medium: '中度', severe: '重度' };

/**
 * 检查超时任务
 * 扫描 ar_flow_nodes 中 node_status = 'in_progress' 且 deadline_at 已过或即将到期的记录
 */
export async function checkTimeoutTasks(): Promise<TimeoutWarningItem[]> {
  try {
    const result = await appQuery<TimeoutRecord>(`
      SELECT fn.id as node_id, fn.customer_task_id, ct.task_no, ct.consumer_name,
        ct.overdue_level, fn.node_type, fn.deadline_at, ct.collector_id,
        u.name as collector_name, u.dingtalk_user_id
      FROM ar_flow_nodes fn
      JOIN ar_customer_collection_tasks ct ON fn.customer_task_id = ct.id
      LEFT JOIN users u ON ct.collector_id = u.id
      WHERE fn.node_status = 'in_progress' AND fn.deadline_at IS NOT NULL
        AND fn.is_timeout = false AND ct.status IN ('pending', 'in_progress')
    `);

    const warnings: TimeoutWarningItem[] = [];
    const now = new Date();

    for (const row of result.rows) {
      const warningHours = await getWarningHours(row.nodeType, row.overdueLevel);
      const warningTime = new Date(now.getTime() + warningHours * 60 * 60 * 1000);
      if (warningTime >= row.deadlineAt || now > row.deadlineAt) {
        const overdueSinceHours = Math.floor((now.getTime() - new Date(row.deadlineAt).getTime()) / (1000 * 60 * 60));
        warnings.push({ customerTaskId: row.customerTaskId, taskNo: row.taskNo, consumerName: row.consumerName,
          overdueLevel: row.overdueLevel, currentNode: row.nodeType, deadlineAt: row.deadlineAt,
          overdueSinceHours: Math.max(0, overdueSinceHours), collectorName: row.collectorName });
      }
    }
    return warnings;
  } catch (error) {
    console.error('[TimeoutWarning] 检查超时任务失败:', error);
    throw new Error('检查超时任务失败');
  }
}

/**
 * 获取超时预警列表
 */
export async function getTimeoutWarnings(params: { page?: number; pageSize?: number }): Promise<{ list: TimeoutWarningItem[]; total: number }> {
  const page = params.page || 1, pageSize = params.pageSize || 20, offset = (page - 1) * pageSize;
  try {
    const countResult = await appQuery<{ total: string }>(`
      SELECT COUNT(*)::text as total FROM ar_flow_nodes fn
      JOIN ar_customer_collection_tasks ct ON fn.customer_task_id = ct.id
      WHERE fn.node_status = 'in_progress' AND fn.deadline_at IS NOT NULL
        AND fn.is_timeout = false AND ct.status IN ('pending', 'in_progress')
        AND (fn.deadline_at <= NOW() + INTERVAL '4 hours' OR fn.deadline_at <= NOW())
    `);
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    const result = await appQuery<{
      customer_task_id: number; task_no: string; consumer_name: string;
      overdue_level: OverdueLevel; node_type: FlowNodeType; deadline_at: Date; collector_name: string | null;
    }>(`
      SELECT fn.customer_task_id, ct.task_no, ct.consumer_name, ct.overdue_level,
        fn.node_type, fn.deadline_at, u.name as collector_name
      FROM ar_flow_nodes fn
      JOIN ar_customer_collection_tasks ct ON fn.customer_task_id = ct.id
      LEFT JOIN users u ON ct.collector_id = u.id
      WHERE fn.node_status = 'in_progress' AND fn.deadline_at IS NOT NULL
        AND fn.is_timeout = false AND ct.status IN ('pending', 'in_progress')
        AND (fn.deadline_at <= NOW() + INTERVAL '4 hours' OR fn.deadline_at <= NOW())
      ORDER BY fn.deadline_at ASC LIMIT $1 OFFSET $2
    `, [pageSize, offset]);

    const now = new Date();
    const list: TimeoutWarningItem[] = result.rows.map((row) => ({
      customerTaskId: row.customer_task_id, taskNo: row.task_no, consumerName: row.consumer_name,
      overdueLevel: row.overdue_level, currentNode: row.node_type, deadlineAt: row.deadline_at,
      overdueSinceHours: Math.max(0, Math.floor((now.getTime() - new Date(row.deadline_at).getTime()) / (1000 * 60 * 60))),
      collectorName: row.collector_name,
    }));
    return { list, total };
  } catch (error) {
    console.error('[TimeoutWarning] 获取超时预警列表失败:', error);
    throw new Error('获取超时预警列表失败');
  }
}

/**
 * 处理超时预警
 */
export async function processTimeoutWarnings(): Promise<{ checked: number; warnings: number; notified: number }> {
  let checked = 0, warnings = 0, notified = 0;
  try {
    const timeoutTasks = await checkTimeoutTasks();
    checked = timeoutTasks.length;
    if (timeoutTasks.length === 0) return { checked: 0, warnings: 0, notified: 0 };

    const client = await getAppClient();
    try {
      await client.query('BEGIN');
      for (const task of timeoutTasks) {
        const now = new Date();
        if (now > new Date(task.deadlineAt)) {
          await client.query(`UPDATE ar_flow_nodes SET is_timeout = true, node_status = 'timeout', updated_at = NOW()
            WHERE customer_task_id = $1 AND node_type = $2 AND node_status = 'in_progress'`,
            [task.customerTaskId, task.currentNode]);
          await client.query(`UPDATE ar_customer_collection_tasks SET status = 'timeout', updated_at = NOW()
            WHERE id = $1 AND status IN ('pending', 'in_progress')`, [task.customerTaskId]);
          warnings++;
          const warningRecord = { nodeType: task.currentNode, overdueLevel: task.overdueLevel,
            deadlineAt: task.deadlineAt, warnedAt: now, overdueSinceHours: task.overdueSinceHours };
          await client.query(`UPDATE ar_customer_collection_tasks
            SET timeout_warnings = COALESCE(timeout_warnings, '[]'::jsonb) || $1::jsonb, updated_at = NOW()
            WHERE id = $2`, [JSON.stringify([warningRecord]), task.customerTaskId]);
          try { if (await sendTimeoutNotification(task)) notified++; } catch (e) { console.error('[TimeoutWarning] 发送通知失败:', e); }
        }
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    console.log(`[TimeoutWarning] 处理完成: 检查${checked}个, 预警${warnings}个, 通知${notified}个`);
    return { checked, warnings, notified };
  } catch (error) {
    console.error('[TimeoutWarning] 处理超时预警失败:', error);
    throw new Error('处理超时预警失败');
  }
}

/**
 * 发送超时通知（内部函数）
 */
async function sendTimeoutNotification(warning: TimeoutWarningItem): Promise<boolean> {
  try {
    const result = await appQuery<{ dingtalk_user_id: string; name: string }>(
      `SELECT u.dingtalk_user_id, u.name FROM ar_customer_collection_tasks ct
       JOIN users u ON ct.collector_id = u.id WHERE ct.id = $1`, [warning.customerTaskId]);
    if (result.rows.length === 0 || !result.rows[0].dingtalk_user_id) {
      console.log('[TimeoutWarning] 未找到催收人钉钉ID:', warning.customerTaskId); return false;
    }
    const collector = result.rows[0];
    const title = `⏰ 催收任务超时预警`;
    const content = `## ⏰ 催收任务超时预警\n\n**客户名称：** ${warning.consumerName}\n\n**任务编号：** ${warning.taskNo}\n\n**当前节点：** ${nodeTypeMap[warning.currentNode]}\n\n**逾期等级：** ${overdueLevelMap[warning.overdueLevel]}\n\n**截止时间：** ${new Date(warning.deadlineAt).toLocaleString('zh-CN')}\n\n**已超时：** ${warning.overdueSinceHours} 小时\n\n---\n\n请尽快处理该任务，避免进一步考核。\n`;
    const notifyResult = await sendWorkNotification([collector.dingtalk_user_id], title, content);
    if (notifyResult.success) { console.log('[TimeoutWarning] 超时通知发送成功:', warning.taskNo); return true; }
    console.error('[TimeoutWarning] 超时通知发送失败:', notifyResult.message); return false;
  } catch (error) { console.error('[TimeoutWarning] 发送超时通知异常:', error); return false; }
}
