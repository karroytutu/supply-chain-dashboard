/**
 * 催收变更 - 共享工具函数
 * @module services/ar-collection/mutations/shared-utils
 */

import { appQuery as query } from '../../../db/appPool';
import type {
  TaskStatus,
  DetailStatus,
  ActionType,
  ActionResult,
  OperatorInfo,
  CollectionTask,
} from '../ar-collection.types';

/**
 * 获取任务并验证状态
 *
 * @deprecated 该函数使用 appQuery（独立连接池）查询，不在事务内，
 * 无法获取行锁（FOR UPDATE），可能导致 MVCC 快照不一致和竞态条件。
 * 新代码应使用事务内的 inline FOR UPDATE 查询替代。
 */
export async function getTaskAndValidate(
  taskId: number,
  allowedStatuses: TaskStatus[]
): Promise<CollectionTask> {
  const result = await query<CollectionTask>('SELECT * FROM ar_collection_tasks WHERE id = $1', [
    taskId,
  ]);
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
 */
export function mapTaskStatusToDetailStatus(taskStatus: TaskStatus): DetailStatus {
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
      return taskStatus as DetailStatus;
  }
}

/** 记录操作日志 */
export async function logAction(
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
