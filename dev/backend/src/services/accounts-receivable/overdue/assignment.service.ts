/**
 * 任务分配服务
 * 负责逾期应收账款任务的催收人员分配
 */

import { appQuery, getAppClient } from '../../../db/appPool';
import { calculateNodeDeadline } from './deadline.service';
import type {
  OverdueQueryParams,
  AssignmentParams,
  OverdueLevel,
} from '../ar.types';

/**
 * 获取待分配列表
 * 查询 flow_status = 'preprocessing' 且 preprocessing_status = 'completed' 的任务
 * 或 flow_status 已经是 'assigned' 但还未开始催收的任务
 * 支持分页、关键词搜索、逾期等级筛选
 * @param params 查询参数
 * @returns 任务列表和总数
 */
export async function getAssignmentList(
  params: OverdueQueryParams
): Promise<{ list: any[]; total: number }> {
  const { page = 1, pageSize = 20, keyword, overdueLevel } = params;
  const offset = (page - 1) * pageSize;

  let whereClause = `WHERE (
    (t.flow_status = 'preprocessing' AND t.preprocessing_status = 'completed')
    OR (t.flow_status = 'assigned' AND t.status = 'pending')
  )`;
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (overdueLevel) {
    queryParams.push(overdueLevel);
    whereClause += ` AND t.overdue_level = $${paramIndex}`;
    paramIndex++;
  }

  if (keyword) {
    queryParams.push(`%${keyword}%`);
    whereClause += ` AND t.consumer_name ILIKE $${paramIndex}`;
    paramIndex++;
  }

  try {
    // 查询总数
    const countSql = `
      SELECT COUNT(*) as total
      FROM ar_customer_collection_tasks t
      ${whereClause}
    `;
    const countResult = await appQuery(countSql, queryParams);
    const total = parseInt(countResult.rows[0].total, 10);

    // 查询列表（进行字段名映射）
    const listSql = `
      SELECT 
        t.id,
        t.task_no as "taskNo",
        t.consumer_name as "consumerName",
        t.consumer_code as "consumerCode",
        t.manager_users as "managerUsers",
        t.ar_ids as "arIds",
        t.total_amount as "totalAmount",
        t.bill_count as "billCount",
        t.overdue_level as "overdueLevel",
        t.flow_status as "flowStatus",
        t.preprocessing_status as "preprocessingStatus",
        t.preprocessing_at as "preprocessingAt",
        t.preprocessed_by as "preprocessedBy",
        t.assignment_at as "assignmentAt",
        t.assigned_by as "assignedBy",
        t.collector_id as "collectorId",
        t.node_deadlines as "nodeDeadlines",
        t.deadline_at as "deadlineAt",
        u3.name as "collectorName",
        t.created_at as "createdAt",
        COALESCE(
          (SELECT MAX(CURRENT_DATE - r.due_date::date) 
           FROM ar_receivables r WHERE r.id = ANY(t.ar_ids)),
          0
        ) as "maxOverdueDays"
      FROM ar_customer_collection_tasks t
      LEFT JOIN users u3 ON t.collector_id = u3.id
      ${whereClause}
      ORDER BY 
        CASE t.overdue_level 
          WHEN 'severe' THEN 1 
          WHEN 'medium' THEN 2 
          ELSE 3 
        END,
        t.preprocessing_at ASC NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const listResult = await appQuery(listSql, [...queryParams, pageSize, offset]);

    return {
      list: listResult.rows,
      total,
    };
  } catch (error) {
    console.error('[AssignmentService] 获取待分配列表失败:', error);
    throw new Error('获取待分配列表失败');
  }
}

/**
 * 分配任务
 * 更新 collector_id, collector_role = 'marketing'
 * 更新 flow_status = 'assigned', assignment_at, assigned_by
 * 计算催收节点截止时间并更新 node_deadlines 和 deadline_at
 * 在 ar_flow_nodes 创建 assignment 节点记录（已完成）和 collection 节点记录（pending）
 * 推送钉钉通知给催收人（可选，用 try-catch 包裹避免阻塞主流程）
 * @param params 分配参数
 */
export async function assignTask(params: AssignmentParams): Promise<void> {
  const { customerTaskId, collectorId, assignedBy } = params;
  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 获取任务信息
    const taskResult = await client.query(
      `SELECT overdue_level, consumer_name FROM ar_customer_collection_tasks WHERE id = $1`,
      [customerTaskId]
    );

    if (taskResult.rows.length === 0) {
      throw new Error('任务不存在');
    }

    const { overdue_level, consumer_name } = taskResult.rows[0];
    const now = new Date();

    // 计算催收节点截止时间
    const collectionDeadline = await calculateNodeDeadline(
      'collection',
      overdue_level as OverdueLevel,
      now
    );

    // 更新任务状态
    await client.query(
      `UPDATE ar_customer_collection_tasks 
       SET collector_id = $1,
           collector_role = 'marketing',
           flow_status = 'assigned',
           assignment_at = $2,
           assigned_by = $3,
           deadline_at = $4,
           node_deadlines = COALESCE(node_deadlines, '{}'::jsonb) || 
             jsonb_build_object('collection', $4::timestamp),
           updated_at = NOW()
       WHERE id = $5`,
      [collectorId, now, assignedBy, collectionDeadline.toISOString(), customerTaskId]
    );

    // 创建或更新 assignment 节点记录（已完成）
    await client.query(
      `INSERT INTO ar_flow_nodes 
       (customer_task_id, node_type, node_status, operator_id, started_at, completed_at, actual_hours, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5, 0, NOW(), NOW())
       ON CONFLICT (customer_task_id, node_type) DO UPDATE SET
         node_status = $3,
         operator_id = $4,
         started_at = $5,
         completed_at = $5,
         actual_hours = 0,
         updated_at = NOW()`,
      [customerTaskId, 'assignment', 'completed', assignedBy, now]
    );

    // 创建 collection 节点记录（待催收）
    await client.query(
      `INSERT INTO ar_flow_nodes 
       (customer_task_id, node_type, node_status, operator_id, started_at, deadline_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (customer_task_id, node_type) DO UPDATE SET
         node_status = $3,
         operator_id = $4,
         started_at = $5,
         deadline_at = $6,
         updated_at = NOW()`,
      [customerTaskId, 'collection', 'pending', collectorId, now, collectionDeadline]
    );

    // 记录操作日志
    await client.query(
      `INSERT INTO ar_action_logs
       (customer_task_id, action_type, action_by, action_data, remark, created_at)
       VALUES ($1, 'task_assigned', $2,
               jsonb_build_object('collectorId', $3::integer, 'collectionDeadline', $4::timestamp, 'consumerName', $5::text),
               '分配催收任务', NOW())`,
      [customerTaskId, assignedBy, collectorId, collectionDeadline.toISOString(), consumer_name]
    );

    await client.query('COMMIT');

    // 推送钉钉通知（不阻塞主流程）
    try {
      await sendAssignmentNotification(collectorId, consumer_name, customerTaskId, collectionDeadline);
    } catch (notifyError) {
      console.error('[AssignmentService] 发送分配通知失败:', notifyError);
    }

    console.log(`[AssignmentService] 任务 ${customerTaskId} 已分配给催收员 ${collectorId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[AssignmentService] 分配任务失败:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 发送分配通知（内部函数）
 * @param collectorId 催收人ID
 * @param consumerName 客户名称
 * @param taskId 任务ID
 * @param deadline 截止时间
 */
async function sendAssignmentNotification(
  collectorId: number,
  consumerName: string,
  taskId: number,
  deadline: Date
): Promise<void> {
  // 获取催收人信息
  const userResult = await appQuery(
    `SELECT name, dingtalk_user_id FROM users WHERE id = $1`,
    [collectorId]
  );

  if (userResult.rows.length === 0) {
    console.warn(`[AssignmentService] 未找到用户 ${collectorId}`);
    return;
  }

  const { name, dingtalk_user_id } = userResult.rows[0];

  // 这里可以调用钉钉通知服务
  // 暂时只记录日志，实际实现需要引入通知服务
  console.log(`[AssignmentService] 通知 ${name}(${dingtalk_user_id}): 您有新的催收任务 [${consumerName}]，截止时间: ${deadline.toISOString()}`);
}

/**
 * 批量分配任务
 * @param assignments 分配列表
 * @param assignedBy 分配人ID
 * @returns 成功和失败数量
 */
export async function batchAssignTasks(
  assignments: Array<{ customerTaskId: number; collectorId: number }>,
  assignedBy: number
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const { customerTaskId, collectorId } of assignments) {
    try {
      await assignTask({ customerTaskId, collectorId, assignedBy });
      success++;
    } catch (error) {
      console.error(`[AssignmentService] 批量分配失败，任务ID: ${customerTaskId}:`, error);
      failed++;
    }
  }

  console.log(`[AssignmentService] 批量分配完成: 成功 ${success}, 失败 ${failed}`);
  return { success, failed };
}

/**
 * 获取可分配的催收人员列表（营销师角色的用户）
 * @returns 催收人员列表，包含当前任务数量
 */
export async function getAvailableCollectors(): Promise<
  Array<{ id: number; name: string; taskCount: number }>
> {
  try {
    const sql = `
      SELECT 
        u.id,
        u.name,
        COALESCE(t.task_count, 0) as task_count
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN (
        SELECT collector_id, COUNT(*) as task_count
        FROM ar_customer_collection_tasks
        WHERE status IN ('pending', 'in_progress')
        GROUP BY collector_id
      ) t ON u.id = t.collector_id
      WHERE r.code = 'marketing_supervisor'
        AND u.status = 'active'
      ORDER BY task_count ASC, u.name ASC
    `;

    const result = await appQuery(sql);

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      taskCount: parseInt(row.task_count, 10),
    }));
  } catch (error) {
    console.error('[AssignmentService] 获取可分配催收人员失败:', error);
    throw new Error('获取可分配催收人员失败');
  }
}
