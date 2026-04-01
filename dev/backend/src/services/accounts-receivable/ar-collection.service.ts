/**
 * 催收工作流服务
 * 实现催收任务管理、结果提交、升级处理等业务逻辑
 */

import { appQuery, getAppClient } from '../../db/appPool';
import { config } from '../../config';

/**
 * 获取催收日期筛选 SQL 片段
 * 当配置了 AR_COLLECTION_START_DATE 时，筛选 work_time >= 配置日期的记录
 * work_time 为 NULL 的记录默认包含（兼容历史数据）
 */
function getCollectionDateFilter(): { clause: string; params: string[] } {
  const startDate = config.arCollection?.startDate;
  if (!startDate) {
    return { clause: '', params: [] };
  }
  return {
    clause: `AND (r.work_time IS NULL OR r.work_time >= $1)`,
    params: [startDate],
  };
}
import { saveSignature } from './ar-signature.service';
import type { CollectionTaskStatus, CollectionResultType, ReviewStatus } from './ar.types';

/**
 * 生成催收任务编号: AR-TASK-YYYYMMDD-XXXX
 * @returns 任务编号
 */
async function generateTaskNo(): Promise<string> {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

  const result = await appQuery(
    `SELECT COUNT(*) as count FROM ar_collection_tasks 
     WHERE task_no LIKE $1`,
    [`AR-TASK-${dateStr}-%`]
  );

  const count = parseInt(result.rows[0].count, 10) + 1;
  const seq = count.toString().padStart(4, '0');

  return `AR-TASK-${dateStr}-${seq}`;
}

/**
 * 获取催收任务列表
 * @param params - 查询参数
 * @param params.userId - 当前用户ID（null表示查全部，用于管理员/财务）
 * @param params.status - 任务状态筛选
 * @param params.page - 页码
 * @param params.pageSize - 每页条数
 * @returns 任务列表和总数
 */
export async function getCollectionTasks(params: {
  userId?: number;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ list: any[]; total: number }> {
  const { userId, status, page = 1, pageSize = 10 } = params;
  const offset = (page - 1) * pageSize;

  // 获取日期过滤条件
  const dateFilter = getCollectionDateFilter();

  let whereClause = 'WHERE 1=1';
  const queryParams: any[] = [];

  // 添加日期过滤参数（放在最前面，因为 dateFilter 使用 $1）
  let paramIndex = 1;
  if (dateFilter.params.length > 0) {
    queryParams.push(dateFilter.params[0]);
    whereClause += ` AND (r.work_time IS NULL OR r.work_time >= $${paramIndex})`;
    paramIndex++;
  }

  if (userId !== undefined && userId !== null) {
    queryParams.push(userId);
    whereClause += ` AND t.collector_id = $${paramIndex}`;
    paramIndex++;
  }

  if (status) {
    queryParams.push(status);
    whereClause += ` AND t.status = $${paramIndex}`;
    paramIndex++;
  }

  // 查询总数
  const countSql = `
    SELECT COUNT(*) as total
    FROM ar_collection_tasks t
    JOIN ar_receivables r ON t.ar_id = r.id
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
      t.escalate_reason,
      t.review_status,
      t.completed_at,
      t.created_at,
      r.consumer_name,
      r.left_amount as owed_amount,
      r.due_date,
      r.order_no,
      r.bill_order_time,
      r.settle_method,
      r.max_debt_days,
      COALESCE(CURRENT_DATE - r.due_date::date, 0) as overdue_days,
      CASE
        WHEN r.work_time IS NOT NULL THEN CURRENT_DATE - r.work_time::date
        WHEN r.bill_order_time IS NOT NULL THEN CURRENT_DATE - r.bill_order_time::date
        ELSE 0
      END as aging_days,
      u.name as collector_name,
      u.name as collector_real_name
    FROM ar_collection_tasks t
    JOIN ar_receivables r ON t.ar_id = r.id
    LEFT JOIN users u ON t.collector_id = u.id
    ${whereClause}
    ORDER BY t.deadline_at ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const listResult = await appQuery(listSql, [...queryParams, pageSize, offset]);

  return {
    list: listResult.rows,
    total,
  };
}

/**
 * 记录催收操作日志
 * @param client - 数据库客户端
 * @param params - 日志参数
 */
async function logAction(
  client: any,
  params: {
    arId: number;
    taskId: number;
    actionType: string;
    actionBy: number;
    actionData?: Record<string, any>;
    remark?: string;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO ar_action_logs 
     (ar_id, task_id, action_type, action_by, action_data, remark, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      params.arId,
      params.taskId,
      params.actionType,
      params.actionBy,
      params.actionData ? JSON.stringify(params.actionData) : null,
      params.remark || null,
    ]
  );
}

/**
 * 客户确认延期回款
 * @param params - 提交参数
 * @param params.taskId - 任务ID
 * @param params.arId - 应收账款ID
 * @param params.collectorId - 催收人ID
 * @param params.latestPayDate - 最晚回款日期（不超过逾期后30天）
 * @param params.evidenceUrl - 证据URL
 */
export async function submitCustomerDelay(params: {
  taskId: number;
  arId: number;
  collectorId: number;
  latestPayDate: Date;
  evidenceUrl: string;
}): Promise<void> {
  const { taskId, arId, collectorId, latestPayDate, evidenceUrl } = params;

  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 更新催收任务状态
    await client.query(
      `UPDATE ar_collection_tasks 
       SET status = 'completed',
           result_type = 'customer_delay',
           latest_pay_date = $1,
           evidence_type = 'customer_proof',
           evidence_url = $2,
           review_status = 'pending',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [latestPayDate, evidenceUrl, taskId]
    );

    // 更新应收账款状态
    await client.query(
      `UPDATE ar_receivables 
       SET ar_status = 'collecting',
           updated_at = NOW()
       WHERE id = $1`,
      [arId]
    );

    // 记录操作日志
    await logAction(client, {
      arId,
      taskId,
      actionType: 'submit_result',
      actionBy: collectorId,
      actionData: {
        resultType: 'customer_delay',
        latestPayDate,
        evidenceUrl,
      },
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
 * 营销担保延期回款
 * @param params - 提交参数
 * @param params.taskId - 任务ID
 * @param params.arId - 应收账款ID
 * @param params.collectorId - 催收人ID
 * @param params.latestPayDate - 最晚回款日期
 * @param params.signatureData - 签名数据（Base64）
 */
export async function submitGuaranteeDelay(params: {
  taskId: number;
  arId: number;
  collectorId: number;
  latestPayDate: Date;
  signatureData: string;
}): Promise<void> {
  const { taskId, arId, collectorId, latestPayDate, signatureData } = params;

  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 保存签名
    const signatureResult = await client.query(
      `INSERT INTO ar_user_signatures (user_id, signature_data, is_default)
       VALUES ($1, $2, FALSE)
       RETURNING id`,
      [collectorId, signatureData]
    );
    const signatureId = signatureResult.rows[0].id;

    // 更新催收任务状态（直接生效，不需审核）
    await client.query(
      `UPDATE ar_collection_tasks 
       SET status = 'completed',
           result_type = 'guarantee_delay',
           latest_pay_date = $1,
           evidence_type = 'signature',
           signature_data = $2,
           review_status = 'approved',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [latestPayDate, signatureData, taskId]
    );

    // 更新应收账款状态
    await client.query(
      `UPDATE ar_receivables 
       SET ar_status = 'collecting',
           updated_at = NOW()
       WHERE id = $1`,
      [arId]
    );

    // 记录操作日志
    await logAction(client, {
      arId,
      taskId,
      actionType: 'submit_result',
      actionBy: collectorId,
      actionData: {
        resultType: 'guarantee_delay',
        latestPayDate,
        signatureId,
      },
      remark: '营销担保延期，已生效',
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
 * 已回款/已核销
 * @param params - 提交参数
 * @param params.taskId - 任务ID
 * @param params.arId - 应收账款ID
 * @param params.collectorId - 催收人ID
 * @param params.remark - 备注
 */
export async function submitPaidOff(params: {
  taskId: number;
  arId: number;
  collectorId: number;
  remark?: string;
}): Promise<void> {
  const { taskId, arId, collectorId, remark } = params;

  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 更新催收任务状态（等待出纳核实）
    await client.query(
      `UPDATE ar_collection_tasks 
       SET status = 'completed',
           result_type = 'paid_off',
           review_status = 'pending',
           remark = $1,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [remark || null, taskId]
    );

    // 记录操作日志
    await logAction(client, {
      arId,
      taskId,
      actionType: 'submit_result',
      actionBy: collectorId,
      actionData: {
        resultType: 'paid_off',
      },
      remark: remark || '已回款/已核销，等待出纳核实',
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
 * 查找指定角色的用户ID
 * @param client - 数据库客户端
 * @param roleCode - 角色代码
 * @returns 用户ID或null
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
 * 升级催收
 * @param params - 提交参数
 * @param params.taskId - 任务ID
 * @param params.arId - 应收账款ID
 * @param params.collectorId - 催收人ID
 * @param params.escalateReason - 升级原因
 * @returns 新任务ID
 */
export async function submitEscalate(params: {
  taskId: number;
  arId: number;
  collectorId: number;
  escalateReason: string;
}): Promise<{ newTaskId: number }> {
  const { taskId, arId, collectorId, escalateReason } = params;

  const client = await getAppClient();

  try {
    await client.query('BEGIN');

    // 获取当前任务信息
    const currentTaskResult = await client.query(
      `SELECT collector_role FROM ar_collection_tasks WHERE id = $1`,
      [taskId]
    );

    if (currentTaskResult.rows.length === 0) {
      throw new Error('任务不存在');
    }

    const currentRole = currentTaskResult.rows[0].collector_role;

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

    // 更新原任务状态
    await client.query(
      `UPDATE ar_collection_tasks 
       SET status = 'escalated',
           result_type = 'escalate',
           escalate_reason = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [escalateReason, taskId]
    );

    // 生成新任务编号
    const taskNo = await generateTaskNo();

    // 计算新的截止日期（从当前时间起3天）
    const deadlineAt = new Date();
    deadlineAt.setDate(deadlineAt.getDate() + 3);

    // 创建新任务
    const newTaskResult = await client.query(
      `INSERT INTO ar_collection_tasks 
       (ar_id, task_no, collector_id, collector_role, assigned_at, deadline_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), $5, 'pending', NOW(), NOW())
       RETURNING id`,
      [arId, taskNo, newCollectorId, targetRole, deadlineAt]
    );

    const newTaskId = newTaskResult.rows[0].id;

    // 更新应收账款状态
    await client.query(
      `UPDATE ar_receivables 
       SET collector_level = $1,
           current_collector_id = $2,
           ar_status = 'escalated',
           updated_at = NOW()
       WHERE id = $3`,
      [targetRole, newCollectorId, arId]
    );

    // 记录操作日志
    await logAction(client, {
      arId,
      taskId,
      actionType: 'escalate',
      actionBy: collectorId,
      actionData: {
        fromRole: currentRole,
        toRole: targetRole,
        newTaskId,
        escalateReason,
      },
      remark: `催收升级: ${currentRole} -> ${targetRole}`,
    });

    // 记录新任务的创建日志
    await logAction(client, {
      arId,
      taskId: newTaskId,
      actionType: 'task_created',
      actionBy: collectorId,
      actionData: {
        fromTaskId: taskId,
        collectorRole: targetRole,
      },
      remark: '升级创建新催收任务',
    });

    await client.query('COMMIT');

    return { newTaskId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 获取催收任务详情（含催收历史时间线）
 * @param taskId - 任务ID
 * @returns 任务详情和催收历史
 */
export async function getCollectionTaskDetail(taskId: number): Promise<any> {
  // 查询任务详情
  const taskSql = `
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
      r.paid_amount,
      r.due_date,
      r.expire_day,
      r.ar_status,
      u.name as collector_name,
      u.name as collector_real_name,
      ru.name as reviewer_name,
      ru.name as reviewer_real_name
    FROM ar_collection_tasks t
    JOIN ar_receivables r ON t.ar_id = r.id
    LEFT JOIN users u ON t.collector_id = u.id
    LEFT JOIN users ru ON t.reviewed_by = ru.id
    WHERE t.id = $1
  `;

  const taskResult = await appQuery(taskSql, [taskId]);

  if (taskResult.rows.length === 0) {
    throw new Error('任务不存在');
  }

  const task = taskResult.rows[0];

  // 查询催收历史时间线
  const historySql = `
    SELECT 
      l.id,
      l.action_type,
      l.action_by,
      l.action_data,
      l.remark,
      l.created_at,
      u.name as action_by_name,
      u.name as action_by_real_name
    FROM ar_action_logs l
    LEFT JOIN users u ON l.action_by = u.id
    WHERE l.ar_id = $1
    ORDER BY l.created_at DESC
  `;

  const historyResult = await appQuery(historySql, [task.ar_id]);

  return {
    ...task,
    history: historyResult.rows.map((row) => ({
      ...row,
      action_data: row.action_data ? JSON.parse(row.action_data) : null,
    })),
  };
}
