/**
 * OA - 添加评论（独立评论，不执行审批动作）
 * @module services/oa/mutations/add-comment
 */
import { createLogger } from '../../../utils/logger';
const log = createLogger('OA');

import { appQuery as query } from '../../../db/appPool';
import { isCurrentApprover, isApplicant } from '../oa-utils';

/**
 * 向审批实例添加一条评论
 * 权限：当前节点审批人/处理人 或 申请人
 * 评论写入 oa_approval_actions 表（action_type='comment'），不修改节点状态
 */
export async function addCommentToInstance(
  instanceId: number,
  userId: number,
  userName: string,
  comment: string
): Promise<void> {
  // 1. 校验评论内容非空
  if (!comment || !comment.trim()) {
    throw new Error('评论内容不能为空');
  }

  // 2. 校验实例状态（仅 pending/processing 可评论）
  const instResult = await query(
    `SELECT status, current_node_order FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );
  if (instResult.rows.length === 0) {
    throw new Error('审批实例不存在');
  }
  const { status, current_node_order } = instResult.rows[0];
  if (!['pending', 'processing'].includes(status)) {
    throw new Error('该审批已结束，无法评论');
  }

  // 3. 权限校验：当前审批人或申请人
  const isApprover = await isCurrentApprover(instanceId, userId);
  const isOwner = await isApplicant(instanceId, userId);
  if (!isApprover && !isOwner) {
    throw new Error('您没有权限评论此审批');
  }

  // 4. 插入评论记录
  await query(
    `INSERT INTO oa_approval_actions
      (instance_id, action_type, operator_id, operator_name, node_order, comment)
     VALUES ($1, 'comment', $2, $3, $4, $5)`,
    [instanceId, userId, userName, current_node_order, comment.trim()]
  );

  log.info(`Comment added to instance ${instanceId} by ${userName}: ${comment.substring(0, 50)}...`);
}
