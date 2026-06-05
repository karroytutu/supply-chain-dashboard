/**
 * OA 实例表单数据更新
 * @module services/oa/mutations/update-instance
 *
 * 操作型节点（interactionType='operation'）的"更新"操作：
 * 将用户编辑的表单数据合并到实例中，插入操作记录，但不推进流程。
 */

import { appQuery as query } from '../../../db/appPool';
import { mergeFormData } from './shared-utils';

/**
 * 更新 OA 实例的表单数据（不推进流程）
 *
 * @param instanceId - 审批实例 ID
 * @param userId - 当前操作人 ID
 * @param userName - 当前操作人姓名
 * @param newFormData - 用户提交的新表单数据（将与已有 form_data 合并）
 * @param comment - 操作备注（选填）
 */
export async function updateInstanceFormData(
  instanceId: number,
  userId: number,
  userName: string,
  newFormData: Record<string, unknown>,
  comment?: string
): Promise<void> {
  // 1. 查询当前实例的 form_data
  const result = await query<{ form_data: Record<string, unknown> }>(
    `SELECT form_data FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );

  if (result.rows.length === 0) {
    throw new Error('审批实例不存在');
  }

  const existingFormData = result.rows[0].form_data || {};

  // 2. 合并新数据（使用通用 mergeFormData，null/undefined 不覆盖）
  const mergedFormData = mergeFormData(existingFormData, newFormData);

  // 3. 更新 form_data
  await query(
    `UPDATE oa_approval_instances SET form_data = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(mergedFormData), instanceId]
  );

  // 4. 插入操作记录（action_type='update'，不推进节点）
  await query(
    `INSERT INTO oa_approval_actions
       (instance_id, action_type, operator_id, operator_name, comment)
     VALUES ($1, 'update', $2, $3, $4)`,
    [instanceId, userId, userName, comment || null]
  );
}
