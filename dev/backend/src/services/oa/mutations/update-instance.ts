/**
 * OA 实例表单数据更新
 * @module services/oa/mutations/update-instance
 *
 * 操作型节点（interactionType='operation'）的"更新"操作：
 * 将用户编辑的表单数据合并到实例中，插入操作记录，但不推进流程。
 */

import { mergeFormData, transaction } from './shared-utils';
import { lockInstanceById } from '../repositories/approval-instance.repository';
import { getCurrentPendingNodeByUser } from '../repositories/approval-node.repository';

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
  // 所有操作在事务内完成，防止并发竞态 + 保证审计记录与数据一致
  await transaction(async client => {
    // 实例级分布式锁 + 行锁，防止多实例并发状态覆盖
    await client.query('SELECT pg_advisory_xact_lock($1)', [instanceId]);

    // 1. SELECT FOR UPDATE 加行锁
    const instance = await lockInstanceById(client, instanceId);
    if (!instance) {
      throw new Error('审批实例不存在');
    }

    const existingFormData = (instance.form_data as Record<string, unknown>) || {};
    const currentNodeOrder = instance.current_node_order ?? null;

    // 1.5 权限校验：当前处理人或申请人
    const currentNode = currentNodeOrder
      ? await getCurrentPendingNodeByUser(client, instanceId, userId)
      : undefined;
    if (!currentNode && instance.applicant_id !== userId) {
      throw new Error('您不是当前处理人或申请人，无法更新数据');
    }

    // 2. 合并数据
    const mergedFormData = mergeFormData(existingFormData, newFormData);

    // 3. 更新 form_data
    await client.query(
      `UPDATE oa_approval_instances SET form_data = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(mergedFormData), instanceId]
    );

    // 4. 计算编辑 diff（仅变更字段，用于审计追踪）
    const formDataDiff: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(newFormData)) {
      if (JSON.stringify(value) !== JSON.stringify(existingFormData[key])) {
        formDataDiff[key] = value;
      }
    }

    // 5. 插入操作记录（action_type='update'，不推进节点）
    await client.query(
      `INSERT INTO oa_approval_actions
         (instance_id, action_type, operator_id, operator_name, node_order, comment, details)
       VALUES ($1, 'update', $2, $3, $4, $5, $6)`,
      [instanceId, userId, userName, currentNodeOrder, null,
       Object.keys(formDataDiff).length > 0 ? JSON.stringify({ formDataDiff }) : null]
    );

    // 6. 如果用户填写了备注，作为独立 comment 记录插入（统一评论模型）
    if (comment && comment.trim()) {
      await client.query(
        `INSERT INTO oa_approval_actions
           (instance_id, action_type, operator_id, operator_name, node_order, comment)
         VALUES ($1, 'comment', $2, $3, $4, $5)`,
        [instanceId, userId, userName, currentNodeOrder, comment.trim()]
      );
    }
  });
}
