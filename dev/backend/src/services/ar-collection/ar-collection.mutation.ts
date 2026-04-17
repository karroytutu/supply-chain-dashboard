/**
 * 催收管理变更服务
 * 处理核销、延期、差异、升级、确认核销、差异解决等操作
 */

import { appQuery as query, getAppClient as getClient } from '../../db/appPool';
import type {
  TaskStatus,
  ActionType,
  ActionResult,
  VerifyParams,
  ExtensionParams,
  DifferenceParams,
  EscalateParams,
  ConfirmVerifyParams,
  ResolveDifferenceParams,
  CollectionTask,
  EscalationLevel,
} from './ar-collection.types';
import {
  sendCollectionNotification,
  sendCollectionNotificationByRole,
  buildEscalationActionCard,
  buildVerifyResultActionCard,
} from './ar-collection-notify';

// ============================================
// 辅助函数
// ============================================

/** 获取任务并验证状态 */
async function getTaskAndValidate(
  taskId: number,
  allowedStatuses: TaskStatus[]
): Promise<CollectionTask> {
  const result = await query<CollectionTask>(
    'SELECT * FROM ar_collection_tasks WHERE id = $1',
    [taskId]
  );
  if (result.rows.length === 0) {
    throw new Error(`催收任务不存在: ${taskId}`);
  }
  const task = result.rows[0];
  if (!allowedStatuses.includes(task.status)) {
    throw new Error(
      `任务当前状态为"${task.status}"，不允许此操作（允许: ${allowedStatuses.join(', ')}）`
    );
  }
  return task;
}

/** 记录操作日志 */
async function logAction(
  taskId: number,
  detailIds: number[] | null,
  actionType: ActionType,
  actionResult: ActionResult,
  remark: string | null,
  operatorId: number,
  operatorName: string,
  operatorRole: string
): Promise<void> {
  await query(
    `INSERT INTO ar_collection_actions
       (task_id, detail_ids, action_type, action_result, remark,
        operator_id, operator_name, operator_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      taskId,
      detailIds && detailIds.length > 0 ? JSON.stringify(detailIds) : null,
      actionType,
      actionResult,
      remark,
      operatorId,
      operatorName,
      operatorRole,
    ]
  );
}

// ============================================
// 核销回款
// ============================================

/** 核销回款申请 */
export async function submitVerify(
  taskId: number,
  params: VerifyParams,
  operatorId: number,
  operatorName: string,
  operatorRole: string
): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 验证任务状态
    const taskResult = await client.query<CollectionTask>(
      'SELECT * FROM ar_collection_tasks WHERE id = $1 FOR UPDATE',
      [taskId]
    );
    if (taskResult.rows.length === 0) throw new Error(`催收任务不存在: ${taskId}`);
    const task = taskResult.rows[0];
    const allowed: TaskStatus[] = ['collecting', 'extension', 'escalated'];
    if (!allowed.includes(task.status)) {
      throw new Error(`任务状态"${task.status}"不允许核销操作`);
    }

    // 更新明细状态
    const detailIds = params.detail_ids;
    if (detailIds && detailIds.length > 0) {
      await client.query(
        `UPDATE ar_collection_details SET status = 'pending_verify',
           process_type = 'verify', processed_by = $1, process_at = NOW()
         WHERE task_id = $2 AND id = ANY($3)`,
        [operatorId, taskId, detailIds]
      );
    } else {
      await client.query(
        `UPDATE ar_collection_details SET status = 'pending_verify',
           process_type = 'verify', processed_by = $1, process_at = NOW()
         WHERE task_id = $2`,
        [operatorId, taskId]
      );
    }

    // 更新任务状态
    await client.query(
      `UPDATE ar_collection_tasks SET status = 'pending_verify', updated_at = NOW()
       WHERE id = $1`,
      [taskId]
    );

    await client.query('COMMIT');

    // 记录操作日志
    await logAction(taskId, detailIds, 'verify', 'success', params.remark || null, operatorId, operatorName, operatorRole);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================
// 申请延期
// ============================================

/** 申请延期 */
export async function applyExtension(
  taskId: number,
  params: ExtensionParams,
  operatorId: number,
  operatorName: string,
  operatorRole: string
): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const taskResult = await client.query<CollectionTask>(
      'SELECT * FROM ar_collection_tasks WHERE id = $1 FOR UPDATE',
      [taskId]
    );
    if (taskResult.rows.length === 0) throw new Error(`催收任务不存在: ${taskId}`);
    const task = taskResult.rows[0];

    if (!task.can_extend) {
      throw new Error('该任务已使用过延期机会，不可再次延期');
    }
    if (params.extension_days > 30) {
      throw new Error('延期天数不得超过30天');
    }

    // 创建延期记录
    const extensionFrom = new Date().toISOString();
    const extensionUntil = new Date(
      Date.now() + params.extension_days * 24 * 60 * 60 * 1000
    ).toISOString();

    const extResult = await client.query(
      `INSERT INTO ar_extension_records
         (task_id, detail_ids, extension_days, extension_from, extension_until,
          evidence_file_id, signature_url, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
       RETURNING id`,
      [
        taskId,
        params.detail_ids?.length ? JSON.stringify(params.detail_ids) : null,
        params.extension_days,
        extensionFrom,
        extensionUntil,
        params.evidence_file_id || null,
        params.signature_url || null,
        operatorId,
      ]
    );

    const extensionId = extResult.rows[0].id;

    // 更新任务
    await client.query(
      `UPDATE ar_collection_tasks
       SET status = 'extension', extension_until = $1, can_extend = false,
           extension_count = 1, current_extension_id = $2, updated_at = NOW()
       WHERE id = $3`,
      [extensionUntil, extensionId, taskId]
    );

    // 更新明细状态
    if (params.detail_ids && params.detail_ids.length > 0) {
      await client.query(
        `UPDATE ar_collection_details SET status = 'extension'
         WHERE task_id = $1 AND id = ANY($2)`,
        [taskId, params.detail_ids]
      );
    }

    await client.query('COMMIT');

    await logAction(taskId, params.detail_ids, 'extension', 'success', params.remark || null, operatorId, operatorName, operatorRole);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================
// 标记差异
// ============================================

/** 标记差异 */
export async function markDifference(
  taskId: number,
  params: DifferenceParams,
  operatorId: number,
  operatorName: string,
  operatorRole: string
): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    await getTaskAndValidate(taskId, ['collecting', 'extension', 'escalated']);

    // 更新任务状态
    await client.query(
      `UPDATE ar_collection_tasks SET status = 'difference_processing', updated_at = NOW()
       WHERE id = $1`,
      [taskId]
    );

    // 更新明细状态
    if (params.detail_ids && params.detail_ids.length > 0) {
      await client.query(
        `UPDATE ar_collection_details SET status = 'difference_pending', remark = $1
         WHERE task_id = $2 AND id = ANY($3)`,
        [params.remark, taskId, params.detail_ids]
      );
    }

    await client.query('COMMIT');

    await logAction(taskId, params.detail_ids, 'difference', 'success', params.remark, operatorId, operatorName, operatorRole);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================
// 升级处理
// ============================================

/** 升级处理 */
export async function escalateTask(
  taskId: number,
  params: EscalateParams,
  operatorId: number,
  operatorName: string,
  operatorRole: string
): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const taskResult = await client.query<CollectionTask>(
      'SELECT * FROM ar_collection_tasks WHERE id = $1 FOR UPDATE',
      [taskId]
    );
    if (taskResult.rows.length === 0) throw new Error(`催收任务不存在: ${taskId}`);
    const task = taskResult.rows[0];

    // 逐级升级验证
    const currentLevel = task.escalation_level;
    const targetLevel = currentLevel + 1;
    if (targetLevel > 2) {
      throw new Error('已达到最高升级级别，无法继续升级');
    }

    // 确定目标处理角色
    const handlerRoleMap: Record<number, string> = {
      1: 'marketing_manager',
      2: 'current_accountant',
    };
    const targetRole = handlerRoleMap[targetLevel];

    // 更新任务
    await client.query(
      `UPDATE ar_collection_tasks
       SET status = 'escalated', escalation_level = $1,
           escalation_count = escalation_count + 1,
           last_escalated_at = NOW(), last_escalated_by = $2,
           escalation_reason = $3, current_handler_role = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [targetLevel, operatorId, params.reason, targetRole, taskId]
    );

    // 标记选中的明细为已升级
    if (params.detail_ids && params.detail_ids.length > 0) {
      await client.query(
        `UPDATE ar_collection_details SET status = 'escalated', remark = $1
         WHERE task_id = $2 AND id = ANY($3)`,
        [params.reason, taskId, params.detail_ids]
      );
    }

    await client.query('COMMIT');

    await logAction(taskId, params.detail_ids, 'escalate', 'success', params.reason, operatorId, operatorName, operatorRole);

    // 发送升级通知（ActionCard）
    try {
      const actionCard = buildEscalationActionCard(
        task,
        currentLevel,
        targetLevel as EscalationLevel,
        operatorName
      );
      await sendCollectionNotificationByRole(targetRole, actionCard.title, '', {
        msgType: 'actionCard',
        actionCard,
        businessType: 'collection',
        businessId: taskId,
        businessNo: task.task_no,
      });
    } catch (notifyErr) {
      console.error('[CollectionMutation] 发送升级通知失败:', notifyErr);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================
// 出纳确认核销
// ============================================

/** 出纳确认核销 */
export async function confirmVerify(
  taskId: number,
  params: ConfirmVerifyParams,
  operatorId: number,
  operatorName: string,
  operatorRole: string
): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const taskResult = await client.query<CollectionTask>(
      'SELECT * FROM ar_collection_tasks WHERE id = $1 FOR UPDATE',
      [taskId]
    );
    if (taskResult.rows.length === 0) throw new Error(`催收任务不存在: ${taskId}`);
    const task = taskResult.rows[0];
    if (task.status !== 'pending_verify') {
      throw new Error(`任务状态"${task.status}"不允许确认核销（需: pending_verify）`);
    }

    if (params.confirmed) {
      // 通过: 更新为已核销
      await client.query(
        `UPDATE ar_collection_tasks SET status = 'verified', updated_at = NOW()
         WHERE id = $1`,
        [taskId]
      );
      await client.query(
        `UPDATE ar_collection_details SET status = 'full_verified'
         WHERE task_id = $1 AND status = 'pending_verify'`,
        [taskId]
      );
    } else {
      // 驳回: 回退为催收中
      await client.query(
        `UPDATE ar_collection_tasks SET status = 'collecting', updated_at = NOW()
         WHERE id = $1`,
        [taskId]
      );
      await client.query(
        `UPDATE ar_collection_details SET status = 'pending'
         WHERE task_id = $1 AND status = 'pending_verify'`,
        [taskId]
      );
    }

    await client.query('COMMIT');

    const result = params.confirmed ? 'success' : 'failed';
    await logAction(taskId, params.detail_ids, 'confirm_verify', result, params.remark || null, operatorId, operatorName, operatorRole);

    // 发送核销结果通知（ActionCard）
    try {
      // 查询核销提交人
      const submitterResult = await query<{ processed_by: number }>(
        `SELECT DISTINCT processed_by FROM ar_collection_details
         WHERE task_id = $1 AND processed_by IS NOT NULL`,
        [taskId]
      );
      const submitterIds = submitterResult.rows.map(r => r.processed_by);

      if (submitterIds.length > 0) {
        const actionCard = buildVerifyResultActionCard(task, params.confirmed, operatorName, params.remark);
        await sendCollectionNotification({
          userIds: submitterIds,
          title: actionCard.title,
          content: '',
          options: {
            msgType: 'actionCard',
            actionCard,
            businessType: 'collection',
            businessId: taskId,
            businessNo: task.task_no,
          },
        });
      }
    } catch (notifyErr) {
      console.error('[CollectionMutation] 发送核销结果通知失败:', notifyErr);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================
// 差异解决
// ============================================

/** 处理差异(财务) */
export async function resolveDifference(
  taskId: number,
  params: ResolveDifferenceParams,
  operatorId: number,
  operatorName: string,
  operatorRole: string
): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    await getTaskAndValidate(taskId, ['difference_processing']);

    // 更新明细
    if (params.detail_ids && params.detail_ids.length > 0) {
      await client.query(
        `UPDATE ar_collection_details SET status = 'difference_resolved', remark = $1
         WHERE task_id = $2 AND id = ANY($3)`,
        [params.resolution, taskId, params.detail_ids]
      );
    }

    // 差异解决后回催收
    await client.query(
      `UPDATE ar_collection_tasks SET status = 'collecting', updated_at = NOW()
       WHERE id = $1`,
      [taskId]
    );

    await client.query('COMMIT');

    await logAction(taskId, params.detail_ids, 'resolve_difference', 'success', params.remark || params.resolution, operatorId, operatorName, operatorRole);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
