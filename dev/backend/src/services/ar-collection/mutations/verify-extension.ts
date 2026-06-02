/**
 * 催收变更 - 核销与延期操作
 * @module services/ar-collection/mutations/verify-extension
 */

import { appQuery as query, getAppClient as getClient } from '../../../db/appPool';
import { checkExistingBillIds } from '../../erp-client/erp-debt.service';
import { AR_EXTENSION_MAX_DAYS } from '../../../utils/constants';
import { invalidateTaskCache, invalidateStatsCache } from '../ar-collection.repository';
import type {
  TaskStatus,
  VerifyParams,
  ExtensionParams,
  DifferenceParams,
  ConfirmVerifyParams,
  OperatorInfo,
  CollectionTask,
} from '../ar-collection.types';
import {
  sendCollectionNotification,
  buildVerifyResultActionCard,
} from '../ar-collection-notify';
import { logAction } from './shared-utils';

/** 核销回款申请 */
export async function submitVerify(
  taskId: number,
  params: VerifyParams,
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
    const allowed: TaskStatus[] = ['collecting', 'extension', 'escalated', 'difference_processing'];
    if (!allowed.includes(task.status)) {
      throw new Error(`任务状态"${task.status}"不允许核销操作`);
    }

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

    await client.query(
      `UPDATE ar_collection_tasks SET status = 'pending_verify', updated_at = NOW() WHERE id = $1`,
      [taskId]
    );

    await client.query('COMMIT');
    invalidateTaskCache(taskId);
    invalidateStatsCache();

    await logAction(taskId, detailIds, 'verify', 'success', params.remark || null, operator);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

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

    await client.query(
      `UPDATE ar_collection_tasks
       SET status = 'extension', extension_until = $1, can_extend = false,
           extension_count = 1, current_extension_id = $2, updated_at = NOW()
       WHERE id = $3`,
      [extensionUntil, extensionId, taskId]
    );

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

    const extensionRemark = `申请延期${params.extension_days}天，至${extensionUntil}${params.remark ? '。' + params.remark : ''}`;
    await logAction(taskId, params.detail_ids, 'extension', 'success', extensionRemark, operator);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[CollectionMutation] applyExtension FAILED for taskId=%d:', taskId, err instanceof Error ? err.message : err);
    throw err;
  } finally {
    client.release();
  }
}

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

    await client.query(
      `UPDATE ar_collection_tasks SET status = 'difference_processing', updated_at = NOW() WHERE id = $1`,
      [taskId]
    );

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

/** 出纳确认核销 */
export async function confirmVerify(
  taskId: number,
  params: ConfirmVerifyParams,
  operator: OperatorInfo
): Promise<void> {
  const client = await getClient();
  try {
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
          const existingBillIds = await checkExistingBillIds(billIds);
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
      const targetStatus = allErpBillsGone ? 'closed' : 'verified';
      await client.query(
        `UPDATE ar_collection_tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
        [targetStatus, taskId]
      );
      await client.query(
        `UPDATE ar_collection_details SET status = 'full_verified'
         WHERE task_id = $1 AND status = 'pending_verify'`,
        [taskId]
      );
    } else {
      await client.query(
        `UPDATE ar_collection_tasks SET status = 'collecting', updated_at = NOW() WHERE id = $1`,
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

    try {
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
