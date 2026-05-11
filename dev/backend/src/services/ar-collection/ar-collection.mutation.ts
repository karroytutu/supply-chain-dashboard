/**
 * 催收管理变更服务
 * 处理核销、延期、差异、升级、确认核销、差异解决等操作
 */

import { appQuery as query, getAppClient as getClient } from '../../db/appPool';
import { query as erpQuery } from '../../db/pool';
import { AR_EXTENSION_MAX_DAYS, AR_ESCALATION_HANDLER_ROLES, AR_ROLLBACK_HANDLER_ROLES } from '../../utils/constants';
import { invalidateTaskCache, invalidateStatsCache } from './ar-collection.repository';
import type {
  TaskStatus,
  DetailStatus,
  ActionType,
  ActionResult,
  VerifyParams,
  ExtensionParams,
  DifferenceParams,
  EscalateParams,
  ConfirmVerifyParams,
  ResolveDifferenceParams,
  RollbackParams,
  CollectionTask,
  EscalationLevel,
  OperatorInfo,
} from './ar-collection.types';
import {
  sendCollectionNotification,
  sendCollectionNotificationByRole,
  buildEscalationActionCard,
  buildVerifyResultActionCard,
  buildRollbackActionCard,
  ESCALATION_LEVEL_NAMES,
} from './ar-collection-notify';

// ============================================
// 辅助函数
// ============================================

/**
 * 获取任务并验证状态
 *
 * @deprecated 该函数使用 appQuery（独立连接池）查询，不在事务内，
 * 无法获取行锁（FOR UPDATE），可能导致 MVCC 快照不一致和竞态条件。
 * 新代码应使用事务内的 inline FOR UPDATE 查询替代。
 * @see applyExtension 中的 inline FOR UPDATE 模式
 * @see markDifference 中的 inline FOR UPDATE 模式
 */
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

/**
 * 任务状态 → 明细状态映射
 * 任务与明细的状态体系不同，退回升级等场景需要正确映射
 */
function mapTaskStatusToDetailStatus(taskStatus: TaskStatus): DetailStatus {
  switch (taskStatus) {
    case 'collecting':
      return 'pending';
    case 'difference_processing':
      return 'difference_pending';
    case 'verified':
      return 'full_verified';
    case 'closed':
      return 'full_verified';
    default:
      // extension, pending_verify, escalated 等任务状态与明细状态同名
      return taskStatus as DetailStatus;
  }
}

/** 记录操作日志 */
async function logAction(
  taskId: number,
  detailIds: number[] | null,
  actionType: ActionType,
  actionResult: ActionResult,
  remark: string | null,
  operator: OperatorInfo
): Promise<void> {
  await query(
    `INSERT INTO ar_collection_actions
       (task_id, detail_ids, action_type, action_result, remark,
        operator_id, operator_name, operator_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      taskId,
      detailIds && detailIds.length > 0 ? detailIds : null,
      actionType,
      actionResult,
      remark,
      operator.id,
      operator.name,
      operator.role,
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
  operator: OperatorInfo
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
    const allowed: TaskStatus[] = ['collecting', 'extension', 'escalated', 'difference_processing'];
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
        [operator.id, taskId, detailIds]
      );
    } else {
      await client.query(
        `UPDATE ar_collection_details SET status = 'pending_verify',
           process_type = 'verify', processed_by = $1, process_at = NOW()
         WHERE task_id = $2`,
        [operator.id, taskId]
      );
    }

    // 更新任务状态
    await client.query(
      `UPDATE ar_collection_tasks SET status = 'pending_verify', updated_at = NOW()
       WHERE id = $1`,
      [taskId]
    );

    await client.query('COMMIT');
    invalidateTaskCache(taskId);
    invalidateStatsCache();

    // 记录操作日志
    await logAction(taskId, detailIds, 'verify', 'success', params.remark || null, operator);
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
  operator: OperatorInfo
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

    console.log('[CollectionMutation] applyExtension: taskId=%d, currentStatus=%s, canExtend=%s, requestedDays=%d', taskId, task.status, task.can_extend, params.extension_days);

    if (!task.can_extend) {
      throw new Error('该任务已使用过延期机会，不可再次延期');
    }
    if (!Number.isInteger(params.extension_days) || params.extension_days <= 0 || params.extension_days > AR_EXTENSION_MAX_DAYS) {
      throw new Error(`延期天数必须是1-${AR_EXTENSION_MAX_DAYS}之间的整数`);
    }

    // 创建延期记录
    const extensionFrom = new Date().toISOString().split('T')[0];
    const extensionUntil = new Date(
      Date.now() + params.extension_days * 24 * 60 * 60 * 1000
    ).toISOString().split('T')[0];

    const extResult = await client.query(
      `INSERT INTO ar_extension_records
         (task_id, detail_ids, extension_days, extension_from, extension_until,
          evidence_file_id, signature_url, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
       RETURNING id`,
      [
        taskId,
        params.detail_ids?.length ? params.detail_ids : null,
        params.extension_days,
        extensionFrom,
        extensionUntil,
        params.evidence_file_id || null,
        params.signature_url || null,
        operator.id,
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

    console.log('[CollectionMutation] applyExtension: committing status=extension for taskId=%d', taskId);
    await client.query('COMMIT');
    invalidateTaskCache(taskId);
    invalidateStatsCache();

    console.log('[CollectionMutation] applyExtension: committed and cache invalidated for taskId=%d', taskId);

    await logAction(taskId, params.detail_ids, 'extension', 'success', params.remark || null, operator);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[CollectionMutation] applyExtension FAILED for taskId=%d:', taskId, err instanceof Error ? err.message : err);
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
  operator: OperatorInfo
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
    const allowedStatuses: TaskStatus[] = ['collecting', 'extension', 'escalated'];
    if (!allowedStatuses.includes(task.status)) {
      throw new Error(
        `任务当前状态为"${task.status}"，不允许此操作（允许: ${allowedStatuses.join(', ')}）`
      );
    }

    console.log('[CollectionMutation] markDifference: taskId=%d, currentStatus=%s', taskId, task.status);

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

    console.log('[CollectionMutation] markDifference: committing status=difference_processing for taskId=%d', taskId);
    await client.query('COMMIT');
    invalidateTaskCache(taskId);
    invalidateStatsCache();

    console.log('[CollectionMutation] markDifference: committed and cache invalidated for taskId=%d', taskId);

    await logAction(taskId, params.detail_ids, 'difference', 'success', params.remark, operator);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[CollectionMutation] markDifference FAILED for taskId=%d:', taskId, err instanceof Error ? err.message : err);
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
  operator: OperatorInfo
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
    let targetLevel: EscalationLevel;
    if (params.target_level !== undefined) {
      if (params.target_level <= currentLevel || params.target_level > 2) {
        throw new Error('无效的升级目标级别');
      }
      targetLevel = params.target_level;
    } else {
      const nextLevel = currentLevel + 1;
      if (nextLevel > 2) {
        throw new Error('已达到最高升级级别，无法继续升级');
      }
      targetLevel = nextLevel as EscalationLevel;
    }

    // 确定目标处理角色
    const targetRole = AR_ESCALATION_HANDLER_ROLES[targetLevel];

    // 更新任务
    await client.query(
      `UPDATE ar_collection_tasks
       SET status = 'escalated', escalation_level = $1,
           escalation_count = escalation_count + 1,
           last_escalated_at = NOW(), last_escalated_by = $2,
           escalation_reason = $3, current_handler_role = $4,
           pre_escalation_status = $5, updated_at = NOW()
       WHERE id = $6`,
      [targetLevel, operator.id, params.reason, targetRole, task.status, taskId]
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
    invalidateTaskCache(taskId);
    invalidateStatsCache();

    await logAction(taskId, params.detail_ids, 'escalate', 'success', params.reason, operator);

    // 发送升级通知（ActionCard）
    try {
      const actionCard = buildEscalationActionCard(
        task,
        currentLevel,
        targetLevel,
        operator.name
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
  operator: OperatorInfo
): Promise<void> {
  const client = await getClient();
  try {
    // 核销确认通过时，先在事务外检查ERP数据（避免跨库事务持锁）
    let allErpBillsGone = false;
    if (params.confirmed) {
      const detailResult = await query<{ erp_bill_id: string }>(
        `SELECT erp_bill_id FROM ar_collection_details
         WHERE task_id = $1 AND erp_bill_id IS NOT NULL`,
        [taskId]
      );
      if (detailResult.rows.length > 0) {
        try {
          const billIds = detailResult.rows.map(r => r.erp_bill_id);
          const placeholders = billIds.map((_, i) => `$${i + 1}`).join(',');
          const erpResult = await erpQuery<{ billId: string }>(
            `SELECT "billId" FROM "客户欠款明细"
             WHERE "leftAmount"::numeric > 0 AND "billId" IN (${placeholders})`,
            billIds
          );
          const existingBillIds = new Set(erpResult.rows.map(r => r.billId));
          allErpBillsGone = billIds.every(id => !existingBillIds.has(id));
        } catch (erpErr) {
          console.error('[CollectionMutation] ERP数据检查失败，按常规核销处理:', erpErr);
        }
      }
    }

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
      // 根据ERP检查结果决定目标状态：所有单据已消失则关闭任务，否则标记为已核销
      const targetStatus = allErpBillsGone ? 'closed' : 'verified';
      await client.query(
        `UPDATE ar_collection_tasks SET status = $1, updated_at = NOW()
         WHERE id = $2`,
        [targetStatus, taskId]
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
    invalidateTaskCache(taskId);
    invalidateStatsCache();

    const result = params.confirmed ? 'success' : 'failed';
    const actionRemark = allErpBillsGone
      ? '核销确认通过，ERP欠款已结清，系统自动关闭任务'
      : (params.remark || null);
    await logAction(taskId, params.detail_ids, 'confirm_verify', result, actionRemark, operator);

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
        const notifyRemark = allErpBillsGone
          ? 'ERP欠款已结清，任务已自动关闭'
          : params.remark;
        const actionCard = buildVerifyResultActionCard(task, params.confirmed, operator.name, notifyRemark);
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
  operator: OperatorInfo
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
    if (task.status !== 'difference_processing') {
      throw new Error(`任务状态"${task.status}"不允许差异解决操作（需: difference_processing）`);
    }

    // 更新明细
    if (params.detail_ids && params.detail_ids.length > 0) {
      await client.query(
        `UPDATE ar_collection_details SET status = 'difference_resolved', remark = $1
         WHERE task_id = $2 AND id = ANY($3)`,
        [params.remark, taskId, params.detail_ids]
      );
    }

    // 差异解决后回催收
    await client.query(
      `UPDATE ar_collection_tasks SET status = 'collecting', updated_at = NOW()
       WHERE id = $1`,
      [taskId]
    );

    await client.query('COMMIT');
    invalidateTaskCache(taskId);
    invalidateStatsCache();

    await logAction(taskId, params.detail_ids, 'resolve_difference', 'success', params.remark, operator);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================
// 退回升级
// ============================================

/** 退回升级 */
export async function rollbackEscalation(
  taskId: number,
  params: RollbackParams,
  operator: OperatorInfo
): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const taskResult = await client.query<CollectionTask>(
      'SELECT * FROM ar_collection_tasks WHERE id = $1 FOR UPDATE',
      [taskId]
    );
    if (taskResult.rows.length === 0) throw new Error('催收任务不存在');
    const task = taskResult.rows[0];

    // 验证：仅升级后的任务可退回
    if (task.status !== 'escalated') {
      throw new Error('仅升级后的任务可以退回');
    }
    if (task.escalation_level < 1) {
      throw new Error('当前为营销师层级，无法继续退回');
    }

    const targetLevel = task.escalation_level - 1;
    const targetRole = AR_ROLLBACK_HANDLER_ROLES[task.escalation_level];
    const targetStatus: TaskStatus = task.pre_escalation_status || 'collecting';

    // 更新任务状态
    await client.query(
      `UPDATE ar_collection_tasks
       SET status = $1, escalation_level = $2, current_handler_role = $3,
           current_handler_id = NULL, pre_escalation_status = NULL, updated_at = NOW()
       WHERE id = $4`,
      [targetStatus, targetLevel, targetRole, taskId]
    );

    // 恢复已升级的明细状态（任务状态需映射为明细状态）
    const detailStatus = mapTaskStatusToDetailStatus(targetStatus);
    await client.query(
      `UPDATE ar_collection_details SET status = $1
       WHERE task_id = $2 AND status = 'escalated'`,
      [detailStatus, taskId]
    );

    await client.query('COMMIT');
    invalidateTaskCache(taskId);
    invalidateStatsCache();

    await logAction(
      taskId,
      null,
      'rollback',
      'success',
      `退回至${ESCALATION_LEVEL_NAMES[targetLevel as EscalationLevel]}，恢复状态: ${targetStatus}。原因: ${params.reason}`,
      operator
    );

    // 发送退回通知
    try {
      const actionCard = buildRollbackActionCard(
        task,
        task.escalation_level,
        targetLevel as EscalationLevel,
        operator.name,
        targetStatus
      );
      const notifyOptions = {
        msgType: 'actionCard' as const,
        actionCard,
        businessType: 'collection' as const,
        businessId: taskId,
        businessNo: task.task_no,
      };

      if (targetLevel === 0) {
        // L1→L0: 通知任务关联的营销师（manager_user_id）
        if (task.manager_user_id) {
          await sendCollectionNotification({
            userIds: [task.manager_user_id],
            title: actionCard.title,
            content: '',
            options: notifyOptions,
          });
        }
      } else {
        // L2→L1: 通知营销经理角色
        await sendCollectionNotificationByRole(targetRole, actionCard.title, '', notifyOptions);
      }
    } catch (notifyErr) {
      console.error('[CollectionMutation] 发送退回通知失败:', notifyErr);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
