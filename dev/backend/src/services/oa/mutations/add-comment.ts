/**
 * OA - 添加评论（独立评论，不执行审批动作）
 * @module services/oa/mutations/add-comment
 */
import { createLogger } from '../../../utils/logger';
const log = createLogger('OA');

import { appQuery as query } from '../../../db/appPool';
import { AttachmentMeta } from '../oa.types';
import { isApprovalParticipant } from '../oa-utils';

/**
 * 向审批实例添加一条评论
 * 权限：审批流程参与者（申请人 / 任意节点分配人 / 抄送人）
 * 评论写入 oa_approval_actions 表（action_type='comment'），不修改节点状态
 */
export async function addCommentToInstance(
  instanceId: number,
  userId: number,
  userName: string,
  comment: string,
  attachments?: AttachmentMeta[]
): Promise<void> {
  // 1. 校验评论内容非空
  if (!comment || !comment.trim()) {
    throw new Error('评论内容不能为空');
  }

  // 2. 校验实例存在 + 获取当前节点顺序
  const instResult = await query(
    `SELECT current_node_order FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );
  if (instResult.rows.length === 0) {
    throw new Error('审批实例不存在');
  }
  const { current_node_order } = instResult.rows[0];

  // 3. 权限校验：审批流程参与者
  const isParticipant = await isApprovalParticipant(instanceId, userId);
  if (!isParticipant) {
    throw new Error('您没有权限评论此审批');
  }

  // 4. 插入评论记录
  await query(
    `INSERT INTO oa_approval_actions
      (instance_id, action_type, operator_id, operator_name, node_order, comment, attachments)
     VALUES ($1, 'comment', $2, $3, $4, $5, $6)`,
    [instanceId, userId, userName, current_node_order, comment.trim(), attachments && attachments.length > 0 ? JSON.stringify(attachments) : null]
  );

  log.info(`Comment added to instance ${instanceId} by ${userName}: ${comment.substring(0, 50)}...`);
}
