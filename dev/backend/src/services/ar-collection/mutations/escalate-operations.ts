/**
 * 催收变更 - 升级与退回操作
 * @module services/ar-collection/mutations/escalate-operations
 */

import { getAppClient as getClient } from '../../../db/appPool';
import {
  AR_ESCALATION_HANDLER_ROLES,
  AR_ROLLBACK_HANDLER_ROLES,
} from '../../../utils/constants';
import { invalidateTaskCache, invalidateStatsCache } from '../ar-collection.repository';
import type {
  TaskStatus,
  EscalateParams,
  ResolveDifferenceParams,
  RollbackParams,
  OperatorInfo,
  CollectionTask,
  EscalationLevel,
} from '../ar-collection.types';
import {
  sendCollectionNotification,
  sendCollectionNotificationByRole,
  buildEscalationActionCard,
  buildRollbackActionCard,
  ESCALATION_LEVEL_NAMES,
} from '../ar-collection-notify';
import { logAction, mapTaskStatusToDetailStatus } from './shared-utils';

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

    const targetRole = AR_ESCALATION_HANDLER_ROLES[targetLevel];

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

    try {
      const actionCard = buildEscalationActionCard(
        task, currentLevel, targetLevel, operator.name
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

    if (params.detail_ids && params.detail_ids.length > 0) {
      await client.query(
        `UPDATE ar_collection_details SET status = 'difference_resolved', remark = $1
         WHERE task_id = $2 AND id = ANY($3)`,
        [params.remark, taskId, params.detail_ids]
      );
    }

    await client.query(
      `UPDATE ar_collection_tasks SET status = 'collecting', updated_at = NOW() WHERE id = $1`,
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

    if (task.status !== 'escalated') {
      throw new Error('仅升级后的任务可以退回');
    }
    if (task.escalation_level < 1) {
      throw new Error('当前为营销师层级，无法继续退回');
    }

    const targetLevel = task.escalation_level - 1;
    const targetRole = AR_ROLLBACK_HANDLER_ROLES[task.escalation_level];
    const targetStatus: TaskStatus = task.pre_escalation_status || 'collecting';

    await client.query(
      `UPDATE ar_collection_tasks
       SET status = $1, escalation_level = $2, current_handler_role = $3,
           current_handler_id = NULL, pre_escalation_status = NULL, updated_at = NOW()
       WHERE id = $4`,
      [targetStatus, targetLevel, targetRole, taskId]
    );

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
      taskId, null, 'rollback', 'success',
      `退回至${ESCALATION_LEVEL_NAMES[targetLevel as EscalationLevel]}，恢复状态: ${targetStatus}。原因: ${params.reason}`,
      operator
    );

    try {
      const actionCard = buildRollbackActionCard(
        task, task.escalation_level, targetLevel as EscalationLevel, operator.name, targetStatus
      );
      const notifyOptions = {
        msgType: 'actionCard' as const,
        actionCard,
        businessType: 'collection' as const,
        businessId: taskId,
        businessNo: task.task_no,
      };

      if (targetLevel === 0) {
        if (task.manager_user_id) {
          await sendCollectionNotification({
            userIds: [task.manager_user_id],
            title: actionCard.title,
            content: '',
            options: notifyOptions,
          });
        }
      } else {
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
