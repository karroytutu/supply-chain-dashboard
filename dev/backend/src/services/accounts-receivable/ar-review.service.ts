/**
 * 审核业务逻辑服务
 * 实现财务审核、出纳核实等业务流程
 * 支持客户维度催收任务
 */

import { appQuery, getAppClient } from '../../db/appPool';
import type { ReviewStatus } from './ar.types';

/**
 * 记录催收操作日志
 * @param client - 数据库客户端
 * @param params - 日志参数
 */
async function logAction(
  client: any,
  params: {
    arId: number;
    taskId?: number;
    customerTaskId?: number;
    actionType: string;
    actionBy: number;
    actionData?: Record<string, any>;
    remark?: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO ar_action_logs 
     (ar_id, task_id, customer_task_id, action_type, action_by, action_data, remark, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      params.arId,
      params.taskId || null,
      params.customerTaskId || null,
      params.actionType,
      params.actionBy,
      params.actionData ? JSON.stringify(params.actionData) : null,
      params.remark || null,
    ]
  );
}

/**
 * 获取待审核任务列表
 * @param params - 查询参数
 * @param params.reviewType - 审核类型: finance_review（财务审核）/ cashier_verify（出纳核实）
 * @param params.page - 页码
 * @param params.pageSize - 每页条数
 * @returns 待审核任务列表和总数
 */
export async function getReviewTasks(params: {
  reviewType?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ list: any[]; total: number }> {
  const { reviewType, page = 1, pageSize = 10 } = params;
  const offset = (page - 1) * pageSize;

  // 根据审核类型确定筛选条件
  let resultTypeFilter: string;
  if (reviewType === 'cashier_verify') {
    resultTypeFilter = "result_type = 'paid_off'";
  } else {
    // 默认财务审核
    resultTypeFilter = "result_type = 'customer_delay'";
  }

  const whereClause = `WHERE t.status = 'completed' AND t.review_status = 'pending' AND ${resultTypeFilter}`;

  // 查询总数
  const countSql = `
    SELECT COUNT(*) as total
    FROM ar_collection_tasks t
    ${whereClause}
  `;
  const countResult = await appQuery(countSql);
  const total = parseInt(countResult.rows[0].total, 10);

  // 查询列表
  const listSql = `
    SELECT 
      t.id,
      t.ar_id,
      t.task_no,
      t.collector_id,
      t.collector_role,
      t.assigned_at,
      t.deadline_at,
      t.status,
      t.result_type,
      t.latest_pay_date,
      t.evidence_type,
      t.evidence_url,
      t.signature_data,
      t.escalate_reason,
      t.remark,
      t.completed_at,
      t.created_at,
      r.erp_bill_id,
      r.consumer_name,
      r.consumer_code,
      r.salesman_name,
      r.dept_name,
      r.total_amount,
      r.left_amount as owed_amount,
      r.due_date,
      r.expire_day,
      u.name as collector_name,
      u.name as collector_real_name
    FROM ar_collection_tasks t
    JOIN ar_receivables r ON t.ar_id = r.id
    LEFT JOIN users u ON t.collector_id = u.id
    ${whereClause}
    ORDER BY t.completed_at ASC
    LIMIT $1 OFFSET $2
  `;

  const listResult = await appQuery(listSql, [pageSize, offset]);

  return {
    list: listResult.rows,
    total,
  };
}

/**
 * 审核通过
 * @param params - 审核参数
 * @param params.taskId - 任务ID
 * @param params.reviewerId - 审核人ID
 * @param params.reviewerName - 审核人姓名
 * @param params.reviewComment - 审核意见
 */
export async function approveReview(params: {
  taskId: number;
  reviewerId: number;
  reviewerName: string;
  reviewComment?: string;
}): Promise<void> {
  const { taskId, reviewerId, reviewerName, reviewComment } = params;

  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 获取任务信息
    const taskResult = await client.query(
      `SELECT ar_id, result_type FROM ar_collection_tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      throw new Error('任务不存在');
    }

    const { ar_id: arId, result_type: resultType } = taskResult.rows[0];

    // 更新任务审核状态
    await client.query(
      `UPDATE ar_collection_tasks 
       SET review_status = 'approved',
           reviewed_by = $1,
           review_comment = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [reviewerId, reviewComment || null, taskId]
    );

    // 根据结果类型处理应收账款状态
    if (resultType === 'paid_off') {
      // 出纳核实通过：更新应收账款为已解决
      await client.query(
        `UPDATE ar_receivables 
         SET ar_status = 'resolved',
             updated_at = NOW()
         WHERE id = $1`,
        [arId]
      );
    }
    // customer_delay 审核通过保持 collecting 状态

    // 记录操作日志
    await logAction(client, {
      arId,
      taskId,
      actionType: 'review_approved',
      actionBy: reviewerId,
      actionData: {
        reviewerName,
        resultType,
        reviewComment: reviewComment || null,
      },
      remark: reviewComment || '审核通过',
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 审核拒绝
 * @param params - 审核参数
 * @param params.taskId - 任务ID
 * @param params.reviewerId - 审核人ID
 * @param params.reviewerName - 审核人姓名
 * @param params.rejectComment - 拒绝原因
 */
export async function rejectReview(params: {
  taskId: number;
  reviewerId: number;
  reviewerName: string;
  rejectComment: string;
}): Promise<void> {
  const { taskId, reviewerId, reviewerName, rejectComment } = params;

  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 获取任务信息
    const taskResult = await client.query(
      `SELECT ar_id FROM ar_collection_tasks WHERE id = $1`,
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      throw new Error('任务不存在');
    }

    const { ar_id: arId } = taskResult.rows[0];

    // 更新任务审核状态
    await client.query(
      `UPDATE ar_collection_tasks 
       SET review_status = 'rejected',
           reviewed_by = $1,
           review_comment = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [reviewerId, rejectComment, taskId]
    );

    // 重置应收账款状态为逾期，允许重新催收
    await client.query(
      `UPDATE ar_receivables 
       SET ar_status = 'overdue',
           updated_at = NOW()
       WHERE id = $1`,
      [arId]
    );

    // 记录操作日志
    await logAction(client, {
      arId,
      taskId,
      actionType: 'review_rejected',
      actionBy: reviewerId,
      actionData: {
        reviewerName,
        rejectComment,
      },
      remark: `审核拒绝: ${rejectComment}`,
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 获取已处理的催收/审核记录
 * @param params - 查询参数
 * @param params.userId - 用户ID（可选，用于筛选该用户处理过的记录）
 * @param params.page - 页码
 * @param params.pageSize - 每页条数
 * @returns 历史记录列表和总数
 */
export async function getHistoryRecords(params: {
  userId?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ list: any[]; total: number }> {
  const { userId, page = 1, pageSize = 10 } = params;
  const offset = (page - 1) * pageSize;

  // 构建查询条件
  let whereClause = `WHERE t.status = 'completed'`;
  const queryParams: any[] = [];

  if (userId !== undefined && userId !== null) {
    // 查询该用户作为催收人或审核人处理过的记录
    whereClause += ` AND (t.collector_id = $1 OR t.reviewed_by = $1)`;
    queryParams.push(userId);
  }

  // 查询总数
  const countSql = `
    SELECT COUNT(*) as total
    FROM ar_collection_tasks t
    ${whereClause}
  `;
  const countResult = await appQuery(countSql, queryParams);
  const total = parseInt(countResult.rows[0].total, 10);

  // 查询列表
  const listSql = `
    SELECT 
      t.id,
      t.ar_id,
      t.task_no,
      t.collector_id,
      t.collector_role,
      t.assigned_at,
      t.deadline_at,
      t.status,
      t.result_type,
      t.latest_pay_date,
      t.evidence_type,
      t.evidence_url,
      t.signature_data,
      t.escalate_reason,
      t.remark,
      t.reviewed_by,
      t.review_status,
      t.review_comment,
      t.completed_at,
      t.created_at,
      r.erp_bill_id,
      r.consumer_name,
      r.consumer_code,
      r.salesman_name,
      r.dept_name,
      r.total_amount,
      r.left_amount as owed_amount,
      r.due_date,
      collector.name as collector_name,
      collector.name as collector_real_name,
      reviewer.name as reviewer_name,
      reviewer.name as reviewer_real_name
    FROM ar_collection_tasks t
    JOIN ar_receivables r ON t.ar_id = r.id
    LEFT JOIN users collector ON t.collector_id = collector.id
    LEFT JOIN users reviewer ON t.reviewed_by = reviewer.id
    ${whereClause}
    ORDER BY t.completed_at DESC
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `;

  const listResult = await appQuery(listSql, [...queryParams, pageSize, offset]);

  return {
    list: listResult.rows,
    total,
  };
}

// ==================== 客户任务审核功能 ====================

/**
 * 获取客户维度待审核任务列表
 */
export async function getCustomerReviewTasks(params: {
  reviewType?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ list: any[]; total: number }> {
  const { reviewType, page = 1, pageSize = 10 } = params;
  const offset = (page - 1) * pageSize;

  // 根据审核类型确定筛选条件
  let resultTypeFilter: string;
  if (reviewType === 'cashier_verify') {
    resultTypeFilter = "t.result_type IN ('paid_off', 'mixed')";
  } else {
    // 默认财务审核
    resultTypeFilter = "t.result_type IN ('customer_delay', 'mixed')";
  }

  const whereClause = `WHERE t.status = 'completed' AND t.review_status = 'pending' AND ${resultTypeFilter}`;

  // 查询总数
  const countSql = `
    SELECT COUNT(*) as total
    FROM ar_customer_collection_tasks t
    ${whereClause}
  `;
  const countResult = await appQuery(countSql);
  const total = parseInt(countResult.rows[0].total, 10);

  // 查询列表
  const listSql = `
    SELECT 
      t.id,
      t.task_no,
      t.consumer_name,
      t.consumer_code,
      t.manager_users,
      t.ar_ids,
      t.total_amount,
      t.bill_count,
      t.collector_id,
      t.collector_role,
      t.assigned_at,
      t.deadline_at,
      t.status,
      t.result_type,
      t.latest_pay_date,
      t.evidence_url,
      t.signature_data,
      t.remark,
      t.review_status,
      t.completed_at,
      t.created_at,
      u.name as collector_name
    FROM ar_customer_collection_tasks t
    LEFT JOIN users u ON t.collector_id = u.id
    ${whereClause}
    ORDER BY t.completed_at ASC
    LIMIT $1 OFFSET $2
  `;

  const listResult = await appQuery(listSql, [pageSize, offset]);

  // 为每个任务获取关联的单据详情
  const tasksWithBills = await Promise.all(
    listResult.rows.map(async (task) => {
      const billsResult = await appQuery(
        `SELECT 
          r.id as ar_id,
          r.erp_bill_id,
          r.order_no,
          r.left_amount,
          r.due_date,
          br.result_type as bill_result_type,
          br.latest_pay_date as bill_latest_pay_date
         FROM ar_receivables r
         LEFT JOIN ar_bill_results br ON br.ar_id = r.id AND br.customer_task_id = $1
         WHERE r.id = ANY($2)
         ORDER BY r.due_date ASC`,
        [task.id, task.ar_ids]
      );
      return {
        ...task,
        bills: billsResult.rows,
      };
    })
  );

  return {
    list: tasksWithBills,
    total,
  };
}

/**
 * 客户任务审核通过
 */
export async function approveCustomerTaskReview(params: {
  customerTaskId: number;
  reviewerId: number;
  reviewerName: string;
  reviewComment?: string;
}): Promise<void> {
  const { customerTaskId, reviewerId, reviewerName, reviewComment } = params;

  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 获取任务信息
    const taskResult = await client.query(
      `SELECT ar_ids, result_type FROM ar_customer_collection_tasks WHERE id = $1`,
      [customerTaskId]
    );

    if (taskResult.rows.length === 0) {
      throw new Error('任务不存在');
    }

    const { ar_ids, result_type } = taskResult.rows[0];

    // 更新客户任务审核状态
    await client.query(
      `UPDATE ar_customer_collection_tasks 
       SET review_status = 'approved',
           reviewed_by = $1,
           review_comment = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [reviewerId, reviewComment || null, customerTaskId]
    );

    // 更新单据结果状态
    await client.query(
      `UPDATE ar_bill_results 
       SET remark = COALESCE(remark, '') || ' [审核通过]' 
       WHERE customer_task_id = $1`,
      [customerTaskId]
    );

    // 根据结果类型批量更新应收账款状态
    if (result_type === 'paid_off') {
      await client.query(
        `UPDATE ar_receivables 
         SET ar_status = 'resolved', updated_at = NOW()
         WHERE id = ANY($1)`,
        [ar_ids]
      );
    } else if (result_type === 'mixed') {
      const billResults = await client.query(
        `SELECT ar_id, result_type FROM ar_bill_results WHERE customer_task_id = $1`,
        [customerTaskId]
      );

      for (const bill of billResults.rows) {
        if (bill.result_type === 'paid_off') {
          await client.query(
            `UPDATE ar_receivables SET ar_status = 'resolved', updated_at = NOW() WHERE id = $1`,
            [bill.ar_id]
          );
        }
      }
    }

    // 记录操作日志
    for (const arId of ar_ids) {
      await logAction(client, {
        arId,
        customerTaskId,
        actionType: 'review_approved',
        actionBy: reviewerId,
        actionData: {
          reviewerName,
          resultType: result_type,
          reviewComment: reviewComment || null,
        },
        remark: reviewComment || '审核通过',
      });
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 客户任务审核拒绝
 */
export async function rejectCustomerTaskReview(params: {
  customerTaskId: number;
  reviewerId: number;
  reviewerName: string;
  rejectComment: string;
}): Promise<void> {
  const { customerTaskId, reviewerId, reviewerName, rejectComment } = params;

  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 获取任务信息
    const taskResult = await client.query(
      `SELECT ar_ids FROM ar_customer_collection_tasks WHERE id = $1`,
      [customerTaskId]
    );

    if (taskResult.rows.length === 0) {
      throw new Error('任务不存在');
    }

    const { ar_ids } = taskResult.rows[0];

    // 更新客户任务审核状态
    await client.query(
      `UPDATE ar_customer_collection_tasks 
       SET review_status = 'rejected',
           reviewed_by = $1,
           review_comment = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [reviewerId, rejectComment, customerTaskId]
    );

    // 批量重置应收账款状态为逾期
    await client.query(
      `UPDATE ar_receivables 
       SET ar_status = 'overdue', updated_at = NOW()
       WHERE id = ANY($1)`,
      [ar_ids]
    );

    // 删除单据结果记录
    await client.query(
      `DELETE FROM ar_bill_results WHERE customer_task_id = $1`,
      [customerTaskId]
    );

    // 重置客户任务状态为pending
    await client.query(
      `UPDATE ar_customer_collection_tasks 
       SET status = 'pending', 
           result_type = NULL, 
           latest_pay_date = NULL,
           completed_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [customerTaskId]
    );

    // 记录操作日志
    for (const arId of ar_ids) {
      await logAction(client, {
        arId,
        customerTaskId,
        actionType: 'review_rejected',
        actionBy: reviewerId,
        actionData: {
          reviewerName,
          rejectComment,
        },
        remark: `审核拒绝: ${rejectComment}`,
      });
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 获取客户维度已处理记录
 */
export async function getCustomerHistoryRecords(params: {
  userId?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ list: any[]; total: number }> {
  const { userId, page = 1, pageSize = 10 } = params;
  const offset = (page - 1) * pageSize;

  let whereClause = `WHERE t.status = 'completed'`;
  const queryParams: any[] = [];

  if (userId !== undefined && userId !== null) {
    whereClause += ` AND (t.collector_id = $1 OR t.reviewed_by = $1)`;
    queryParams.push(userId);
  }

  const countSql = `
    SELECT COUNT(*) as total
    FROM ar_customer_collection_tasks t
    ${whereClause}
  `;
  const countResult = await appQuery(countSql, queryParams);
  const total = parseInt(countResult.rows[0].total, 10);

  const listSql = `
    SELECT 
      t.id,
      t.task_no,
      t.consumer_name,
      t.consumer_code,
      t.manager_users,
      t.ar_ids,
      t.total_amount,
      t.bill_count,
      t.collector_id,
      t.collector_role,
      t.assigned_at,
      t.deadline_at,
      t.status,
      t.result_type,
      t.latest_pay_date,
      t.evidence_url,
      t.signature_data,
      t.remark,
      t.reviewed_by,
      t.review_status,
      t.review_comment,
      t.completed_at,
      t.created_at,
      collector.name as collector_name,
      reviewer.name as reviewer_name
    FROM ar_customer_collection_tasks t
    LEFT JOIN users collector ON t.collector_id = collector.id
    LEFT JOIN users reviewer ON t.reviewed_by = reviewer.id
    ${whereClause}
    ORDER BY t.completed_at DESC
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `;

  const listResult = await appQuery(listSql, [...queryParams, pageSize, offset]);

  return {
    list: listResult.rows,
    total,
  };
}
