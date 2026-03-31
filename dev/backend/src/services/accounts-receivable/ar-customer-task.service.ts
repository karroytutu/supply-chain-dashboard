/**
 * 客户维度催收任务服务
 * 实现按客户聚合的催收任务管理
 */

import { appQuery, getAppClient } from '../../db/appPool';
import type {
  CollectorLevel,
  CollectionTaskStatus,
  CollectionResultType,
  ArCustomerCollectionTask,
  ArCustomerTaskBill,
  CreateCustomerTaskParams,
  CustomerTaskQueryParams,
  SubmitUnifiedResultParams,
  SubmitMixedResultsParams,
  EscalateCustomerTaskParams,
} from './ar.types';

/**
 * 生成客户催收任务编号: AR-CUST-YYYYMMDD-XXXX
 */
async function generateCustomerTaskNo(): Promise<string> {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

  const result = await appQuery(
    `SELECT COUNT(*) as count FROM ar_customer_collection_tasks 
     WHERE task_no LIKE $1`,
    [`AR-CUST-${dateStr}-%`]
  );

  const count = parseInt(result.rows[0].count, 10) + 1;
  const seq = count.toString().padStart(4, '0');

  return `AR-CUST-${dateStr}-${seq}`;
}

/**
 * 创建客户催收任务
 * @param params - 创建参数
 * @returns 创建的任务ID
 */
export async function createCustomerTask(
  params: CreateCustomerTaskParams
): Promise<{ id: number; taskNo: string }> {
  const {
    consumerName,
    consumerCode,
    managerUsers,
    arIds,
    collectorId,
    collectorRole,
  } = params;

  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 获取关联AR记录的总金额
    const amountResult = await client.query(
      `SELECT COALESCE(SUM(left_amount), 0) as total_amount
       FROM ar_receivables WHERE id = ANY($1)`,
      [arIds]
    );
    const totalAmount = parseFloat(amountResult.rows[0].total_amount) || 0;

    // 生成任务编号
    const taskNo = await generateCustomerTaskNo();

    // 计算截止日期（3天后）
    const deadlineAt = new Date();
    deadlineAt.setDate(deadlineAt.getDate() + 3);

    // 创建客户任务
    const result = await client.query(
      `INSERT INTO ar_customer_collection_tasks 
       (task_no, consumer_name, consumer_code, manager_users, ar_ids, 
        total_amount, bill_count, collector_id, collector_role, 
        assigned_at, deadline_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, 'pending', NOW(), NOW())
       RETURNING id`,
      [
        taskNo,
        consumerName,
        consumerCode || null,
        managerUsers || null,
        arIds,
        totalAmount,
        arIds.length,
        collectorId,
        collectorRole,
        deadlineAt,
      ]
    );

    const taskId = result.rows[0].id;

    // 更新关联的AR记录状态和客户任务ID
    await client.query(
      `UPDATE ar_receivables 
       SET ar_status = 'overdue',
           current_collector_id = $1,
           collector_level = $2,
           customer_task_id = $3,
           updated_at = NOW()
       WHERE id = ANY($4)`,
      [collectorId, collectorRole, taskId, arIds]
    );

    // 记录操作日志
    await client.query(
      `INSERT INTO ar_action_logs 
       (ar_id, customer_task_id, action_type, action_by, action_data, remark, created_at)
       SELECT 
         id, $1, 'customer_task_created', $2, 
         jsonb_build_object('taskNo', $3, 'arCount', $4, 'totalAmount', $5),
         '创建客户催收任务', NOW()
       FROM ar_receivables WHERE id = ANY($6)`,
      [taskId, collectorId, taskNo, arIds.length, totalAmount, arIds]
    );

    await client.query('COMMIT');
    return { id: taskId, taskNo };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 获取客户催收任务列表
 */
export async function getCustomerTasks(
  params: CustomerTaskQueryParams
): Promise<{ list: any[]; total: number }> {
  const { userId, status, keyword, page = 1, pageSize = 20 } = params;
  const offset = (page - 1) * pageSize;

  let whereClause = 'WHERE 1=1';
  const queryParams: any[] = [];

  if (userId !== undefined && userId !== null) {
    queryParams.push(userId);
    whereClause += ` AND t.collector_id = $${queryParams.length}`;
  }

  if (status) {
    queryParams.push(status);
    whereClause += ` AND t.status = $${queryParams.length}`;
  }

  if (keyword) {
    queryParams.push(`%${keyword}%`);
    whereClause += ` AND t.consumer_name ILIKE $${queryParams.length}`;
  }

  // 查询总数
  const countSql = `
    SELECT COUNT(*) as total
    FROM ar_customer_collection_tasks t
    ${whereClause}
  `;
  const countResult = await appQuery(countSql, queryParams);
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
      t.escalate_reason,
      t.remark,
      t.review_status,
      t.completed_at,
      t.created_at,
      u.name as collector_name,
      EXTRACT(EPOCH FROM (t.deadline_at - NOW())) / 3600 as remaining_hours,
      CASE 
        WHEN t.deadline_at < NOW() AND t.status IN ('pending', 'in_progress')
        THEN EXTRACT(DAY FROM (NOW() - t.deadline_at))
        ELSE 0 
      END as timeout_days
    FROM ar_customer_collection_tasks t
    LEFT JOIN users u ON t.collector_id = u.id
    ${whereClause}
    ORDER BY t.deadline_at ASC
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
  `;

  const listResult = await appQuery(listSql, [...queryParams, pageSize, offset]);

  return {
    list: listResult.rows,
    total,
  };
}

/**
 * 获取客户催收任务详情（含关联单据列表）
 */
export async function getCustomerTaskDetail(taskId: number): Promise<any> {
  // 查询任务详情
  const taskSql = `
    SELECT 
      t.*,
      u.name as collector_name,
      EXTRACT(EPOCH FROM (t.deadline_at - NOW())) / 3600 as remaining_hours,
      CASE 
        WHEN t.deadline_at < NOW() AND t.status IN ('pending', 'in_progress')
        THEN EXTRACT(DAY FROM (NOW() - t.deadline_at))
        ELSE 0 
      END as timeout_days
    FROM ar_customer_collection_tasks t
    LEFT JOIN users u ON t.collector_id = u.id
    WHERE t.id = $1
  `;
  const taskResult = await appQuery(taskSql, [taskId]);

  if (taskResult.rows.length === 0) {
    throw new Error('任务不存在');
  }

  const task = taskResult.rows[0];

  // 查询关联的单据列表
  const billsSql = `
    SELECT 
      r.id as ar_id,
      r.erp_bill_id,
      r.order_no,
      r.left_amount,
      r.due_date,
      r.ar_status,
      COALESCE(CURRENT_DATE - r.due_date::date, 0) as overdue_days,
      br.result_type as bill_result_type,
      br.latest_pay_date as bill_latest_pay_date
    FROM ar_receivables r
    LEFT JOIN ar_bill_results br ON br.ar_id = r.id AND br.customer_task_id = $1
    WHERE r.id = ANY($2)
    ORDER BY r.due_date ASC
  `;
  const billsResult = await appQuery(billsSql, [taskId, task.ar_ids]);

  return {
    ...task,
    bills: billsResult.rows,
  };
}

/**
 * 统一提交催收结果（所有单据同一结果）
 */
export async function submitUnifiedResult(
  params: SubmitUnifiedResultParams
): Promise<void> {
  const {
    customerTaskId,
    collectorId,
    resultType,
    latestPayDate,
    evidenceUrl,
    signatureData,
    escalateReason,
    remark,
  } = params;

  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 获取任务信息
    const taskResult = await client.query(
      `SELECT ar_ids, collector_role, consumer_name FROM ar_customer_collection_tasks WHERE id = $1`,
      [customerTaskId]
    );

    if (taskResult.rows.length === 0) {
      throw new Error('任务不存在');
    }

    const { ar_ids, collector_role, consumer_name } = taskResult.rows[0];

    // 更新客户任务状态
    await client.query(
      `UPDATE ar_customer_collection_tasks 
       SET status = 'completed',
           result_type = $1,
           latest_pay_date = $2,
           evidence_url = $3,
           signature_data = $4,
           escalate_reason = $5,
           remark = $6,
           review_status = CASE WHEN $1 IN ('customer_delay', 'paid_off') THEN 'pending' ELSE 'approved' END,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $7`,
      [
        resultType,
        latestPayDate || null,
        evidenceUrl || null,
        signatureData || null,
        escalateReason || null,
        remark || null,
        customerTaskId,
      ]
    );

    // 为每个AR创建单据结果记录
    for (const arId of ar_ids) {
      await client.query(
        `INSERT INTO ar_bill_results 
         (customer_task_id, ar_id, result_type, latest_pay_date, evidence_url, remark, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (customer_task_id, ar_id) DO UPDATE SET
           result_type = $3,
           latest_pay_date = $4,
           evidence_url = $5,
           remark = $6,
           updated_at = NOW()`,
        [customerTaskId, arId, resultType, latestPayDate || null, evidenceUrl || null, remark || null]
      );
    }

    // 批量更新AR记录状态
    if (resultType === 'customer_delay' || resultType === 'guarantee_delay') {
      await client.query(
        `UPDATE ar_receivables 
         SET ar_status = 'collecting', updated_at = NOW()
         WHERE id = ANY($1)`,
        [ar_ids]
      );
    } else if (resultType === 'escalate') {
      // 升级逻辑单独处理
      await escalateCustomerTaskInternal(client, customerTaskId, ar_ids, collector_role, collectorId, escalateReason || '');
    }

    // 记录操作日志
    await client.query(
      `INSERT INTO ar_action_logs 
       (ar_id, customer_task_id, action_type, action_by, action_data, remark, created_at)
       SELECT 
         id, $1, 'submit_result', $2,
         jsonb_build_object('resultType', $3, 'latestPayDate', $4),
         $5, NOW()
       FROM ar_receivables WHERE id = ANY($6)`,
      [customerTaskId, collectorId, resultType, latestPayDate || null, remark || '提交催收结果', ar_ids]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 混合提交催收结果（不同单据不同结果）
 */
export async function submitMixedResults(
  params: SubmitMixedResultsParams
): Promise<void> {
  const { customerTaskId, collectorId, bills, evidenceUrl, signatureData } = params;

  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 获取任务信息
    const taskResult = await client.query(
      `SELECT ar_ids, collector_role FROM ar_customer_collection_tasks WHERE id = $1`,
      [customerTaskId]
    );

    if (taskResult.rows.length === 0) {
      throw new Error('任务不存在');
    }

    const { ar_ids, collector_role } = taskResult.rows[0];

    // 验证提交的单据都在任务关联范围内
    const submittedArIds = bills.map(b => b.arId);
    const invalidArIds = submittedArIds.filter(id => !ar_ids.includes(id));
    if (invalidArIds.length > 0) {
      throw new Error(`单据 ${invalidArIds.join(', ')} 不属于该任务`);
    }

    // 更新客户任务状态为混合结果
    await client.query(
      `UPDATE ar_customer_collection_tasks 
       SET status = 'completed',
           result_type = 'mixed',
           evidence_url = $1,
           signature_data = $2,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [evidenceUrl || null, signatureData || null, customerTaskId]
    );

    // 处理每个单据的结果
    const delayArIds: number[] = [];
    const escalateArIds: number[] = [];

    for (const bill of bills) {
      // 创建单据结果记录
      await client.query(
        `INSERT INTO ar_bill_results 
         (customer_task_id, ar_id, result_type, latest_pay_date, remark, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (customer_task_id, ar_id) DO UPDATE SET
           result_type = $3,
           latest_pay_date = $4,
           remark = $5,
           updated_at = NOW()`,
        [customerTaskId, bill.arId, bill.resultType, bill.latestPayDate || null, bill.remark || null]
      );

      // 按类型分组处理
      if (bill.resultType === 'customer_delay' || bill.resultType === 'guarantee_delay') {
        delayArIds.push(bill.arId);
      } else if (bill.resultType === 'escalate') {
        escalateArIds.push(bill.arId);
      }
    }

    // 批量更新延期单据状态
    if (delayArIds.length > 0) {
      await client.query(
        `UPDATE ar_receivables 
         SET ar_status = 'collecting', updated_at = NOW()
         WHERE id = ANY($1)`,
        [delayArIds]
      );
    }

    // 处理升级单据
    if (escalateArIds.length > 0) {
      // 升级逻辑：这部分需要根据实际业务需求细化
      // 目前简化处理：标记这些单据为升级状态
      await client.query(
        `UPDATE ar_receivables 
         SET ar_status = 'escalated', updated_at = NOW()
         WHERE id = ANY($1)`,
        [escalateArIds]
      );
    }

    // 记录操作日志
    await client.query(
      `INSERT INTO ar_action_logs 
       (ar_id, customer_task_id, action_type, action_by, action_data, remark, created_at)
       SELECT 
         id, $1, 'submit_result', $2,
         jsonb_build_object('resultType', br.result_type, 'latestPayDate', br.latest_pay_date),
         '混合催收结果', NOW()
       FROM ar_receivables r
       JOIN ar_bill_results br ON br.ar_id = r.id AND br.customer_task_id = $1
       WHERE r.id = ANY($3)`,
      [customerTaskId, collectorId, ar_ids]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 查找指定角色的用户ID
 */
async function findUserByRole(client: any, roleCode: string): Promise<number | null> {
  const result = await client.query(
    `SELECT u.id 
     FROM users u 
     JOIN user_roles ur ON u.id = ur.user_id 
     JOIN roles r ON ur.role_id = r.id 
     WHERE r.code = $1 
     AND u.status = 'active'
     LIMIT 1`,
    [roleCode]
  );

  return result.rows[0]?.id || null;
}

/**
 * 客户任务升级（内部函数）
 */
async function escalateCustomerTaskInternal(
  client: any,
  customerTaskId: number,
  arIds: number[],
  currentRole: string,
  collectorId: number,
  escalateReason: string
): Promise<{ newTaskId: number }> {
  // 确定升级目标
  let targetRole: string;
  let newCollectorId: number | null;

  if (currentRole === 'marketing') {
    targetRole = 'supervisor';
    newCollectorId = await findUserByRole(client, 'marketing_supervisor');
  } else if (currentRole === 'supervisor') {
    targetRole = 'finance';
    newCollectorId = await findUserByRole(client, 'finance_staff');
  } else {
    throw new Error('已达到最高催收层级，无法继续升级');
  }

  if (!newCollectorId) {
    throw new Error(`未找到${targetRole}角色的用户，无法升级`);
  }

  // 标记原任务为已升级
  await client.query(
    `UPDATE ar_customer_collection_tasks 
     SET status = 'escalated',
         result_type = 'escalate',
         escalate_reason = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [escalateReason, customerTaskId]
  );

  // 生成新任务编号
  const taskNo = await generateCustomerTaskNo();

  // 计算新的截止日期
  const deadlineAt = new Date();
  deadlineAt.setDate(deadlineAt.getDate() + 3);

  // 创建新任务
  const newTaskResult = await client.query(
    `INSERT INTO ar_customer_collection_tasks 
     (task_no, consumer_name, consumer_code, manager_users, ar_ids, 
      total_amount, bill_count, collector_id, collector_role, 
      assigned_at, deadline_at, status, created_at, updated_at)
     SELECT task_no, consumer_name, consumer_code, manager_users, ar_ids,
            total_amount, bill_count, $1, $2,
            NOW(), $3, 'pending', NOW(), NOW()
     FROM ar_customer_collection_tasks WHERE id = $4
     RETURNING id`,
    [newCollectorId, targetRole, deadlineAt, customerTaskId]
  );

  const newTaskId = newTaskResult.rows[0].id;

  // 批量更新AR记录
  await client.query(
    `UPDATE ar_receivables 
     SET collector_level = $1,
         current_collector_id = $2,
         customer_task_id = $3,
         ar_status = 'escalated',
         updated_at = NOW()
     WHERE id = ANY($4)`,
    [targetRole, newCollectorId, newTaskId, arIds]
  );

  return { newTaskId };
}

/**
 * 客户任务升级（对外接口）
 */
export async function escalateCustomerTask(
  params: EscalateCustomerTaskParams
): Promise<{ newTaskId: number }> {
  const { customerTaskId, collectorId, escalateReason } = params;

  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 获取任务信息
    const taskResult = await client.query(
      `SELECT ar_ids, collector_role FROM ar_customer_collection_tasks WHERE id = $1`,
      [customerTaskId]
    );

    if (taskResult.rows.length === 0) {
      throw new Error('任务不存在');
    }

    const { ar_ids, collector_role } = taskResult.rows[0];

    const result = await escalateCustomerTaskInternal(
      client,
      customerTaskId,
      ar_ids,
      collector_role,
      collectorId,
      escalateReason
    );

    // 记录操作日志
    await client.query(
      `INSERT INTO ar_action_logs 
       (ar_id, customer_task_id, action_type, action_by, action_data, remark, created_at)
       SELECT 
         id, $1, 'escalate', $2,
         jsonb_build_object('fromRole', $3, 'newTaskId', $4, 'reason', $5),
         '客户任务升级', NOW()
       FROM ar_receivables WHERE id = ANY($6)`,
      [customerTaskId, collectorId, collector_role, result.newTaskId, escalateReason, ar_ids]
    );

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 快速延期操作（统一延期所有单据）
 */
export async function quickDelayCustomerTask(params: {
  customerTaskId: number;
  collectorId: number;
  days: number;
}): Promise<void> {
  const { customerTaskId, collectorId, days } = params;

  const latestPayDate = new Date();
  latestPayDate.setDate(latestPayDate.getDate() + days);
  const latestPayDateStr = latestPayDate.toISOString().split('T')[0];

  await submitUnifiedResult({
    customerTaskId,
    collectorId,
    resultType: 'customer_delay',
    latestPayDate: new Date(latestPayDateStr),
  });
}
