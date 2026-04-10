/**
 * 催收管理 - 法律催收相关服务
 * 处理催收函发送、诉讼提起、法律进展更新
 */

import { appQuery as query } from '../../db/appPool';
import type {
  ActionType,
  ActionResult,
  SendNoticeParams,
  FileLawsuitParams,
  UpdateLegalProgressParams,
} from './ar-collection.types';

/** 检查催收任务是否存在 */
async function ensureTaskExists(taskId: number): Promise<void> {
  const result = await query('SELECT id FROM ar_collection_tasks WHERE id = $1', [taskId]);
  if (result.rows.length === 0) {
    throw new Error(`催收任务不存在: ${taskId}`);
  }
}

/** 记录操作日志(与 mutation 中共享逻辑) */
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

/** 发送催收函 */
export async function sendCollectionNotice(
  taskId: number,
  params: SendNoticeParams,
  operatorId: number,
  operatorName: string,
  operatorRole: string
): Promise<void> {
  await ensureTaskExists(taskId);

  // 创建法律催收进展记录
  await query(
    `INSERT INTO ar_legal_progress (task_id, action, description, attachment_url, operator_id)
     VALUES ($1, 'send_notice', $2, $3, $4)`,
    [taskId, params.description || null, params.attachment_url, operatorId]
  );

  await logAction(taskId, null, 'send_notice', 'success', params.description || '发送催收函', operatorId, operatorName, operatorRole);
}

/** 提起诉讼 */
export async function fileLawsuit(
  taskId: number,
  params: FileLawsuitParams,
  operatorId: number,
  operatorName: string,
  operatorRole: string
): Promise<void> {
  await ensureTaskExists(taskId);

  await query(
    `INSERT INTO ar_legal_progress (task_id, action, description, attachment_url, operator_id)
     VALUES ($1, 'file_lawsuit', $2, $3, $4)`,
    [taskId, params.description, params.attachment_url || null, operatorId]
  );

  await logAction(taskId, null, 'file_lawsuit', 'success', params.description, operatorId, operatorName, operatorRole);
}

/** 更新法律进展 */
export async function updateLegalProgress(
  taskId: number,
  params: UpdateLegalProgressParams,
  operatorId: number,
  operatorName: string,
  operatorRole: string
): Promise<void> {
  await ensureTaskExists(taskId);

  await query(
    `INSERT INTO ar_legal_progress (task_id, action, description, attachment_url, operator_id)
     VALUES ($1, 'update_progress', $2, $3, $4)`,
    [taskId, params.description, params.attachment_url || null, operatorId]
  );

  await logAction(taskId, null, 'update_progress', 'success', params.description, operatorId, operatorName, operatorRole);
}
