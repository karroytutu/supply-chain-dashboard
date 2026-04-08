/**
 * 财务预处理服务
 * 负责逾期应收账款任务的财务预处理流程管理
 */

import { appQuery, getAppClient } from '../../../db/appPool';
import { calculateNodeDeadline } from './deadline.service';
import type {
  OverdueQueryParams,
  PreprocessingStartParams,
  PreprocessingCompleteParams,
  FlowNodeType,
  FlowNodeStatus,
  OverdueLevel,
} from '../ar.types';

/**
 * 获取待预处理列表
 * 查询 ar_customer_collection_tasks 中 flow_status = 'initial' 或 preprocessing_status = 'pending' 的任务
 * 支持分页、关键词搜索、逾期等级筛选
 * @param params 查询参数
 * @returns 任务列表和总数
 */
export async function getPreprocessingList(
  params: OverdueQueryParams
): Promise<{ list: any[]; total: number }> {
  const { page = 1, pageSize = 20, keyword, overdueLevel } = params;
  const offset = (page - 1) * pageSize;

  let whereClause = "WHERE (t.flow_status = 'initial' OR t.preprocessing_status = 'pending')";
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
        t.node_deadlines as "nodeDeadlines",
        t.deadline_at as "deadlineAt",
        t.collector_id as "collectorId",
        u.name as "collectorName",
        t.created_at as "createdAt",
        COALESCE(
          (SELECT MAX(CURRENT_DATE - r.due_date::date) 
           FROM ar_receivables r WHERE r.id = ANY(t.ar_ids)),
          0
        ) as "maxOverdueDays"
      FROM ar_customer_collection_tasks t
      LEFT JOIN users u ON t.collector_id = u.id
      ${whereClause}
      ORDER BY 
        CASE t.overdue_level 
          WHEN 'severe' THEN 1 
          WHEN 'medium' THEN 2 
          ELSE 3 
        END,
        t.created_at ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const listResult = await appQuery(listSql, [...queryParams, pageSize, offset]);

    return {
      list: listResult.rows,
      total,
    };
  } catch (error) {
    console.error('[PreprocessingService] 获取待预处理列表失败:', error);
    throw new Error('获取待预处理列表失败');
  }
}

/**
 * 开始预处理
 * 更新 flow_status = 'preprocessing', preprocessing_status = 'in_progress'
 * 记录 preprocessing_at, preprocessed_by
 * 计算预处理节点截止时间并更新 node_deadlines
 * 同时在 ar_flow_nodes 表中创建预处理节点记录
 * @param params 开始预处理参数
 */
export async function startPreprocessing(params: PreprocessingStartParams): Promise<void> {
  const { customerTaskId, operatorId } = params;
  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 获取任务信息
    const taskResult = await client.query(
      `SELECT overdue_level FROM ar_customer_collection_tasks WHERE id = $1`,
      [customerTaskId]
    );

    if (taskResult.rows.length === 0) {
      throw new Error('任务不存在');
    }

    const { overdue_level } = taskResult.rows[0];
    const now = new Date();

    // 计算预处理节点截止时间
    const deadlineAt = await calculateNodeDeadline('preprocessing', overdue_level as OverdueLevel, now);

    // 更新任务状态
    await client.query(
      `UPDATE ar_customer_collection_tasks 
       SET flow_status = 'preprocessing',
           preprocessing_status = 'in_progress',
           preprocessing_at = $1,
           preprocessed_by = $2,
           node_deadlines = COALESCE(node_deadlines, '{}'::jsonb) || jsonb_build_object('preprocessing', $3::timestamp),
           updated_at = NOW()
       WHERE id = $4`,
      [now, operatorId, deadlineAt.toISOString(), customerTaskId]
    );

    // 创建流程节点记录
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
      [customerTaskId, 'preprocessing', 'in_progress', operatorId, now, deadlineAt]
    );

    // 记录操作日志
    await client.query(
      `INSERT INTO ar_action_logs
       (customer_task_id, action_type, action_by, action_data, remark, created_at)
       VALUES ($1, 'preprocessing_start', $2, jsonb_build_object('deadlineAt', $3::timestamp), '开始财务预处理', NOW())`,
      [customerTaskId, operatorId, deadlineAt.toISOString()]
    );

    await client.query('COMMIT');
    console.log(`[PreprocessingService] 任务 ${customerTaskId} 开始预处理`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[PreprocessingService] 开始预处理失败:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 完成预处理
 * 更新 preprocessing_status = 'completed'
 * 更新 ar_flow_nodes 对应节点的 completed_at 和 actual_hours
 * 检查是否超时(is_timeout)
 * 自动将 flow_status 推进到下一个状态（assigned）
 * @param params 完成预处理参数
 */
export async function completePreprocessing(params: PreprocessingCompleteParams): Promise<void> {
  const { customerTaskId, operatorId, remark } = params;
  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    const now = new Date();

    // 获取节点开始时间和截止时间
    const nodeResult = await client.query(
      `SELECT started_at, deadline_at FROM ar_flow_nodes 
       WHERE customer_task_id = $1 AND node_type = 'preprocessing'`,
      [customerTaskId]
    );

    if (nodeResult.rows.length === 0) {
      throw new Error('预处理节点记录不存在');
    }

    const { started_at, deadline_at } = nodeResult.rows[0];
    const startedAt = new Date(started_at);
    const deadlineAt = deadline_at ? new Date(deadline_at) : null;

    // 计算实际耗时（小时）
    const actualHours = parseFloat(((now.getTime() - startedAt.getTime()) / (1000 * 60 * 60)).toFixed(2));

    // 检查是否超时
    const isTimeout = deadlineAt ? now > deadlineAt : false;

    // 更新任务状态
    await client.query(
      `UPDATE ar_customer_collection_tasks 
       SET preprocessing_status = 'completed',
           flow_status = 'assigned',
           updated_at = NOW()
       WHERE id = $1`,
      [customerTaskId]
    );

    // 更新流程节点记录
    await client.query(
      `UPDATE ar_flow_nodes 
       SET node_status = 'completed',
           completed_at = $1,
           actual_hours = $2,
           is_timeout = $3,
           updated_at = NOW()
       WHERE customer_task_id = $4 AND node_type = 'preprocessing'`,
      [now, actualHours, isTimeout, customerTaskId]
    );

    // 记录操作日志
    await client.query(
      `INSERT INTO ar_action_logs
       (customer_task_id, action_type, action_by, action_data, remark, created_at)
       VALUES ($1, 'preprocessing_complete', $2,
               jsonb_build_object('actualHours', $3::numeric, 'isTimeout', $4::boolean, 'remark', $5::text),
               '完成财务预处理', NOW())`,
      [customerTaskId, operatorId, actualHours, isTimeout, remark || null]
    );

    await client.query('COMMIT');
    console.log(`[PreprocessingService] 任务 ${customerTaskId} 完成预处理，耗时 ${actualHours} 小时，超时: ${isTimeout}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[PreprocessingService] 完成预处理失败:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 批量开始预处理
 * @param customerTaskIds 客户任务ID列表
 * @param operatorId 操作人ID
 * @returns 成功和失败数量
 */
export async function batchStartPreprocessing(
  customerTaskIds: number[],
  operatorId: number
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const taskId of customerTaskIds) {
    try {
      await startPreprocessing({ customerTaskId: taskId, operatorId });
      success++;
    } catch (error) {
      console.error(`[PreprocessingService] 批量开始预处理失败，任务ID: ${taskId}:`, error);
      failed++;
    }
  }

  console.log(`[PreprocessingService] 批量开始预处理完成: 成功 ${success}, 失败 ${failed}`);
  return { success, failed };
}

/**
 * 批量完成预处理
 * @param customerTaskIds 客户任务ID列表
 * @param operatorId 操作人ID
 * @returns 成功和失败数量
 */
export async function batchCompletePreprocessing(
  customerTaskIds: number[],
  operatorId: number
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const taskId of customerTaskIds) {
    try {
      await completePreprocessing({ customerTaskId: taskId, operatorId });
      success++;
    } catch (error) {
      console.error(`[PreprocessingService] 批量完成预处理失败，任务ID: ${taskId}:`, error);
      failed++;
    }
  }

  console.log(`[PreprocessingService] 批量完成预处理完成: 成功 ${success}, 失败 ${failed}`);
  return { success, failed };
}

/**
 * 获取预处理任务关联的订单明细
 * 批量查询任务关联的所有应收账款及各自的催收历史
 * @param taskId 客户任务ID
 * @returns 任务信息和订单明细列表
 */
export async function getPreprocessingTaskBills(taskId: number): Promise<{
  taskInfo: any;
  bills: any[];
}> {
  try {
    // 1. 查询任务信息
    const taskResult = await appQuery(
      `SELECT id, task_no, consumer_name, total_amount, bill_count, overdue_level, ar_ids
       FROM ar_customer_collection_tasks
       WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      throw new Error('任务不存在');
    }

    const task = taskResult.rows[0];
    const arIds = task.ar_ids;

    if (!arIds || arIds.length === 0) {
      return {
        taskInfo: {
          id: task.id,
          taskNo: task.task_no,
          consumerName: task.consumer_name,
          totalAmount: parseFloat(task.total_amount),
          billCount: task.bill_count,
          overdueLevel: task.overdue_level,
        },
        bills: [],
      };
    }

    // 2. 批量查询关联的应收账款记录
    const receivablesResult = await appQuery(
      `SELECT 
         id, erp_bill_id, consumer_name, consumer_code, salesman_name, dept_name,
         manager_users, settle_method, max_debt_days, total_amount, left_amount,
         paid_amount, write_off_amount, bill_order_time, order_no, expire_day,
         overdue_days, last_pay_day, due_date, work_time, ar_status,
         current_collector_id, collector_level, notification_status,
         last_notified_at, last_synced_at, created_at, updated_at
       FROM ar_receivables
       WHERE id = ANY($1)
       ORDER BY left_amount DESC`,
      [arIds]
    );

    // 3. 批量查询每条应收账款的操作日志和通知记录
    const bills = await Promise.all(
      receivablesResult.rows.map(async (receivable) => {
        const arId = receivable.id;

        // 查询操作日志
        const logsResult = await appQuery(
          `SELECT 
             l.id, l.ar_id, l.action_type, l.action_by, l.action_data,
             l.remark, u.name as action_by_name, l.created_at
           FROM ar_action_logs l
           LEFT JOIN users u ON l.action_by = u.id
           WHERE l.ar_id = $1
           ORDER BY l.created_at DESC`,
          [arId]
        );

        // 查询通知记录
        const notificationsResult = await appQuery(
          `SELECT 
             id, ar_ids, notification_type, recipient_id, recipient_name,
             consumer_name, bill_count, message_content, status,
             sent_at, created_at
           FROM ar_notification_records
           WHERE $1 = ANY(ar_ids)
           ORDER BY created_at DESC`,
          [arId]
        );

        // 合并操作日志和通知记录为统一的 actionLogs 格式
        const actionLogs = [
          ...logsResult.rows.map((log) => ({
            id: `log_${log.id}`,
            type: log.action_type,
            actionBy: log.action_by_name || '系统',
            actionData: log.action_data,
            remark: log.remark,
            createdAt: log.created_at,
            source: 'action_log',
          })),
          ...notificationsResult.rows.map((notif) => ({
            id: `notif_${notif.id}`,
            type: notif.notification_type,
            actionBy: notif.recipient_name || '系统',
            actionData: {
              billCount: notif.bill_count,
              messageContent: notif.message_content,
              status: notif.status,
            },
            remark: notif.message_content,
            createdAt: notif.created_at,
            source: 'notification',
          })),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return {
          receivable: {
            id: receivable.id,
            erp_bill_id: receivable.erp_bill_id,
            consumer_name: receivable.consumer_name,
            consumer_code: receivable.consumer_code,
            salesman_name: receivable.salesman_name,
            dept_name: receivable.dept_name,
            manager_users: receivable.manager_users,
            settle_method: receivable.settle_method,
            max_debt_days: receivable.max_debt_days,
            total_amount: parseFloat(receivable.total_amount),
            left_amount: parseFloat(receivable.left_amount),
            paid_amount: parseFloat(receivable.paid_amount),
            write_off_amount: parseFloat(receivable.write_off_amount),
            bill_order_time: receivable.bill_order_time,
            order_no: receivable.order_no,
            expire_day: receivable.expire_day,
            overdue_days: receivable.overdue_days,
            last_pay_day: receivable.last_pay_day,
            due_date: receivable.due_date,
            work_time: receivable.work_time,
            ar_status: receivable.ar_status,
            current_collector_id: receivable.current_collector_id,
            collector_level: receivable.collector_level,
            notification_status: receivable.notification_status,
            last_notified_at: receivable.last_notified_at,
            last_synced_at: receivable.last_synced_at,
            created_at: receivable.created_at,
            updated_at: receivable.updated_at,
          },
          actionLogs,
        };
      })
    );

    return {
      taskInfo: {
        id: task.id,
        taskNo: task.task_no,
        consumerName: task.consumer_name,
        totalAmount: parseFloat(task.total_amount),
        billCount: task.bill_count,
        overdueLevel: task.overdue_level,
      },
      bills,
    };
  } catch (error) {
    console.error('[PreprocessingService] 获取订单明细失败:', error);
    throw new Error('获取订单明细失败');
  }
}
