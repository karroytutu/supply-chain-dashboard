/**
 * OA审批实例变更服务
 * @module services/oa-approval/oa-approval.mutation
 */

import { appQuery as query, getAppClient } from '../../db/appPool';
import { PoolClient } from 'pg';
import {
  FormTypeDefinition,
  SubmitApprovalRequest,
  ApprovalActionRequest,
  OaApprovalInstanceRow,
  OaApprovalNodeRow,
  ApprovalStatus,
  ApprovalNodeStatus,
  Urgency,
} from './oa-approval.types';
import {
  generateInstanceNo,
  validateFormData,
  filterNodesByCondition,
  resolveApproverId,
  findUserIdsByRoleCodes,
  isCurrentApprover,
  isApplicant,
} from './oa-approval-utils';

/**
 * 事务辅助函数
 */
async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getAppClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =====================================================
// 提交审批
// =====================================================

/**
 * 提交审批请求
 */
export async function submitApproval(
  req: SubmitApprovalRequest,
  formType: FormTypeDefinition,
  userId: number,
  userName: string,
  userDept: string | null
): Promise<{ instanceId: number; instanceNo: string }> {
  // 1. 校验表单数据
  const errors = validateFormData(formType.formSchema, req.formData);
  if (errors.length > 0) {
    throw new Error(`表单校验失败: ${errors.join('; ')}`);
  }

  // 2. 生成审批编号
  const instanceNo = await generateInstanceNo();

  // 3. 解析审批节点（根据条件过滤）
  const filteredNodes = filterNodesByCondition(
    formType.workflowDef.nodes,
    req.formData
  );

  if (filteredNodes.length === 0) {
    throw new Error('审批流程配置错误：至少需要一个审批节点');
  }

  // 4. 解析抄送人
  let ccUserIds: number[] = [];
  if (formType.workflowDef.ccRoles && formType.workflowDef.ccRoles.length > 0) {
    ccUserIds = await findUserIdsByRoleCodes(formType.workflowDef.ccRoles);
  }

  // 5. 数据库事务写入
  const result = await transaction(async (client) => {
    // 插入审批实例
    const instanceResult = await client.query<OaApprovalInstanceRow>(
      `INSERT INTO oa_approval_instances
        (instance_no, form_type_id, title, form_data, status, urgency, applicant_id, applicant_name, applicant_dept, current_node_order)
       VALUES
        ($1, (SELECT id FROM oa_form_types WHERE code = $2), $3, $4, 'pending', $5, $6, $7, $8, 1)
       RETURNING *`,
      [
        instanceNo,
        req.formTypeCode,
        req.title,
        JSON.stringify(req.formData),
        req.urgency || 'normal',
        userId,
        userName,
        userDept,
      ]
    );

    const instance = instanceResult.rows[0];

    // 插入审批节点
    for (const node of filteredNodes) {
      const approverId = await resolveApproverId(node, userId);
      
      // 获取审批人姓名
      let approverName: string | null = null;
      if (approverId) {
        const userResult = await client.query<{ name: string }>(
          `SELECT name FROM users WHERE id = $1`,
          [approverId]
        );
        approverName = userResult.rows[0]?.name || null;
      }

      await client.query(
        `INSERT INTO oa_approval_nodes
          (instance_id, node_order, node_name, node_type, role_code, assigned_user_id, assigned_user_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
        [
          instance.id,
          node.order,
          node.name,
          node.type,
          node.roleCode || null,
          approverId,
          approverName,
        ]
      );
    }

    // 插入抄送记录
    for (const ccUserId of ccUserIds) {
      if (ccUserId !== userId) {
        const ccUserResult = await client.query<{ name: string }>(
          `SELECT name FROM users WHERE id = $1`,
          [ccUserId]
        );
        
        await client.query(
          `INSERT INTO oa_approval_cc (instance_id, user_id, user_name)
           VALUES ($1, $2, $3)
           ON CONFLICT (instance_id, user_id) DO NOTHING`,
          [instance.id, ccUserId, ccUserResult.rows[0]?.name || null]
        );
      }
    }

    // 记录操作日志
    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order)
       VALUES ($1, 'submit', $2, $3, 1)`,
      [instance.id, userId, userName]
    );

    return instance;
  });

  return {
    instanceId: result.id,
    instanceNo: result.instance_no,
  };
}

// =====================================================
// 审批操作
// =====================================================

/**
 * 同意审批
 */
export async function approveApproval(
  instanceId: number,
  userId: number,
  userName: string,
  comment?: string
): Promise<void> {
  // 验证是否为当前审批人
  const canApprove = await isCurrentApprover(instanceId, userId);
  if (!canApprove) {
    throw new Error('您不是当前审批人，无法执行此操作');
  }

  await transaction(async (client) => {
    // 获取当前节点
    const nodeResult = await client.query<OaApprovalNodeRow>(
      `SELECT * FROM oa_approval_nodes
       WHERE instance_id = $1 AND assigned_user_id = $2 AND status = 'pending'
       LIMIT 1`,
      [instanceId, userId]
    );

    if (nodeResult.rows.length === 0) {
      throw new Error('未找到待审批节点');
    }

    const currentNode = nodeResult.rows[0];

    // 更新节点状态
    await client.query(
      `UPDATE oa_approval_nodes
       SET status = 'approved', comment = $1, acted_at = NOW()
       WHERE id = $2`,
      [comment || null, currentNode.id]
    );

    // 获取实例信息
    const instanceResult = await client.query<OaApprovalInstanceRow>(
      `SELECT * FROM oa_approval_instances WHERE id = $1`,
      [instanceId]
    );
    const instance = instanceResult.rows[0];

    // 检查是否有下一个节点
    const nextNodeResult = await client.query<OaApprovalNodeRow>(
      `SELECT * FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_order > $2 AND status = 'pending'
       ORDER BY node_order LIMIT 1`,
      [instanceId, currentNode.node_order]
    );

    if (nextNodeResult.rows.length > 0) {
      // 流转到下一节点
      const nextNode = nextNodeResult.rows[0];
      await client.query(
        `UPDATE oa_approval_instances
         SET current_node_order = $1, updated_at = NOW()
         WHERE id = $2`,
        [nextNode.node_order, instanceId]
      );
    } else {
      // 所有节点已完成，审批通过
      await client.query(
        `UPDATE oa_approval_instances
         SET status = 'approved', completed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [instanceId]
      );
    }

    // 记录操作日志
    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order, comment)
       VALUES ($1, 'approve', $2, $3, $4, $5)`,
      [instanceId, userId, userName, currentNode.node_order, comment || null]
    );
  });
}

/**
 * 拒绝审批
 */
export async function rejectApproval(
  instanceId: number,
  userId: number,
  userName: string,
  comment: string
): Promise<void> {
  // 验证是否为当前审批人
  const canApprove = await isCurrentApprover(instanceId, userId);
  if (!canApprove) {
    throw new Error('您不是当前审批人，无法执行此操作');
  }

  await transaction(async (client) => {
    // 获取当前节点
    const nodeResult = await client.query<OaApprovalNodeRow>(
      `SELECT * FROM oa_approval_nodes
       WHERE instance_id = $1 AND assigned_user_id = $2 AND status = 'pending'
       LIMIT 1`,
      [instanceId, userId]
    );

    if (nodeResult.rows.length === 0) {
      throw new Error('未找到待审批节点');
    }

    const currentNode = nodeResult.rows[0];

    // 更新节点状态
    await client.query(
      `UPDATE oa_approval_nodes
       SET status = 'rejected', comment = $1, acted_at = NOW()
       WHERE id = $2`,
      [comment, currentNode.id]
    );

    // 更新实例状态
    await client.query(
      `UPDATE oa_approval_instances
       SET status = 'rejected', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [instanceId]
    );

    // 取消其他待审批节点
    await client.query(
      `UPDATE oa_approval_nodes
       SET status = 'cancelled'
       WHERE instance_id = $1 AND status = 'pending' AND id != $2`,
      [instanceId, currentNode.id]
    );

    // 记录操作日志
    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order, comment)
       VALUES ($1, 'reject', $2, $3, $4, $5)`,
      [instanceId, userId, userName, currentNode.node_order, comment]
    );
  });
}

/**
 * 转交审批
 */
export async function transferApproval(
  instanceId: number,
  userId: number,
  userName: string,
  transferToUserId: number,
  comment?: string
): Promise<void> {
  // 验证是否为当前审批人
  const canApprove = await isCurrentApprover(instanceId, userId);
  if (!canApprove) {
    throw new Error('您不是当前审批人，无法执行此操作');
  }

  // 获取转交目标用户信息
  const targetUserResult = await query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1`,
    [transferToUserId]
  );

  if (targetUserResult.rows.length === 0) {
    throw new Error('转交目标用户不存在');
  }

  const targetUserName = targetUserResult.rows[0].name;

  await transaction(async (client) => {
    // 获取当前节点
    const nodeResult = await client.query<OaApprovalNodeRow>(
      `SELECT * FROM oa_approval_nodes
       WHERE instance_id = $1 AND assigned_user_id = $2 AND status = 'pending'
       LIMIT 1`,
      [instanceId, userId]
    );

    if (nodeResult.rows.length === 0) {
      throw new Error('未找到待审批节点');
    }

    const currentNode = nodeResult.rows[0];

    // 更新原节点状态为已转交
    await client.query(
      `UPDATE oa_approval_nodes
       SET status = 'transferred', comment = $1, acted_at = NOW()
       WHERE id = $2`,
      [`已转交给 ${targetUserName}`, currentNode.id]
    );

    // 创建新节点（同一 node_order，新审批人）
    await client.query(
      `INSERT INTO oa_approval_nodes
        (instance_id, node_order, node_name, node_type, assigned_user_id, assigned_user_name, status)
       VALUES ($1, $2, $3, 'role', $4, $5, 'pending')`,
      [instanceId, currentNode.node_order, currentNode.node_name, transferToUserId, targetUserName]
    );

    // 记录操作日志
    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order, comment, details)
       VALUES ($1, 'transfer', $2, $3, $4, $5, $6)`,
      [
        instanceId,
        userId,
        userName,
        currentNode.node_order,
        comment || null,
        JSON.stringify({ transferToUserId, transferToUserName: targetUserName }),
      ]
    );
  });
}

/**
 * 加签
 */
export async function countersignApproval(
  instanceId: number,
  userId: number,
  userName: string,
  countersignType: 'before' | 'after',
  countersignUserIds: number[],
  comment?: string
): Promise<void> {
  // 验证是否为当前审批人
  const canApprove = await isCurrentApprover(instanceId, userId);
  if (!canApprove) {
    throw new Error('您不是当前审批人，无法执行此操作');
  }

  if (countersignUserIds.length === 0) {
    throw new Error('请选择至少一个加签人');
  }

  // 获取加签人信息
  const countersignUsersResult = await query<{ id: number; name: string }>(
    `SELECT id, name FROM users WHERE id = ANY($1)`,
    [countersignUserIds]
  );

  const countersignUsers = countersignUsersResult.rows;

  await transaction(async (client) => {
    // 获取当前节点
    const nodeResult = await client.query<OaApprovalNodeRow>(
      `SELECT * FROM oa_approval_nodes
       WHERE instance_id = $1 AND assigned_user_id = $2 AND status = 'pending'
       LIMIT 1`,
      [instanceId, userId]
    );

    if (nodeResult.rows.length === 0) {
      throw new Error('未找到待审批节点');
    }

    const currentNode = nodeResult.rows[0];

    // 获取所有节点，调整顺序
    const allNodesResult = await client.query<OaApprovalNodeRow>(
      `SELECT * FROM oa_approval_nodes WHERE instance_id = $1 ORDER BY node_order`,
      [instanceId]
    );

    // 根据加签类型调整节点顺序
    if (countersignType === 'before') {
      // 前加签：加签节点在当前节点之前
      // 将当前节点及之后的节点顺序 + 加签人数
      const increment = countersignUsers.length;
      for (const node of allNodesResult.rows) {
        if (node.node_order >= currentNode.node_order) {
          await client.query(
            `UPDATE oa_approval_nodes SET node_order = node_order + $1 WHERE id = $2`,
            [increment, node.id]
          );
        }
      }

      // 插入加签节点
      let insertOrder = currentNode.node_order;
      for (const csUser of countersignUsers) {
        await client.query(
          `INSERT INTO oa_approval_nodes
            (instance_id, node_order, node_name, node_type, assigned_user_id, assigned_user_name, status, is_countersign, countersign_parent_node_id)
           VALUES ($1, $2, '加签', 'countersign', $3, $4, 'pending', true, $5)`,
          [instanceId, insertOrder++, csUser.name, csUser.name, currentNode.id]
        );
      }

      // 更新实例当前节点
      await client.query(
        `UPDATE oa_approval_instances SET current_node_order = $1, updated_at = NOW() WHERE id = $2`,
        [currentNode.node_order, instanceId]
      );

    } else {
      // 后加签：加签节点在当前节点之后
      // 将当前节点之后的节点顺序 + 加签人数
      const increment = countersignUsers.length;
      for (const node of allNodesResult.rows) {
        if (node.node_order > currentNode.node_order) {
          await client.query(
            `UPDATE oa_approval_nodes SET node_order = node_order + $1 WHERE id = $2`,
            [increment, node.id]
          );
        }
      }

      // 插入加签节点
      let insertOrder = currentNode.node_order + 1;
      for (const csUser of countersignUsers) {
        await client.query(
          `INSERT INTO oa_approval_nodes
            (instance_id, node_order, node_name, node_type, assigned_user_id, assigned_user_name, status, is_countersign, countersign_parent_node_id)
           VALUES ($1, $2, '加签', 'countersign', $3, $4, 'pending', true, $5)`,
          [instanceId, insertOrder++, csUser.name, csUser.name, currentNode.id]
        );
      }
    }

    // 记录操作日志
    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order, comment, details)
       VALUES ($1, 'countersign', $2, $3, $4, $5, $6)`,
      [
        instanceId,
        userId,
        userName,
        currentNode.node_order,
        comment || null,
        JSON.stringify({
          countersignType,
          countersignUserIds,
          countersignUserNames: countersignUsers.map(u => u.name),
        }),
      ]
    );
  });
}

/**
 * 撤回审批
 */
export async function withdrawApproval(
  instanceId: number,
  userId: number,
  userName: string
): Promise<void> {
  // 验证是否为申请人
  const isOwner = await isApplicant(instanceId, userId);
  if (!isOwner) {
    throw new Error('只有申请人可以撤回审批');
  }

  // 检查审批状态
  const instanceResult = await query<OaApprovalInstanceRow>(
    `SELECT * FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );

  if (instanceResult.rows.length === 0) {
    throw new Error('审批实例不存在');
  }

  const instance = instanceResult.rows[0];

  if (instance.status !== 'pending') {
    throw new Error('只有审批中的申请可以撤回');
  }

  await transaction(async (client) => {
    // 更新实例状态
    await client.query(
      `UPDATE oa_approval_instances
       SET status = 'withdrawn', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [instanceId]
    );

    // 取消所有待审批节点
    await client.query(
      `UPDATE oa_approval_nodes
       SET status = 'cancelled'
       WHERE instance_id = $1 AND status = 'pending'`,
      [instanceId]
    );

    // 记录操作日志
    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name)
       VALUES ($1, 'withdraw', $2, $3)`,
      [instanceId, userId, userName]
    );
  });
}

// =====================================================
// 站内消息
// =====================================================

/**
 * 标记消息已读
 */
export async function markMessageRead(messageId: number, userId: number): Promise<void> {
  await query(
    `UPDATE oa_in_app_messages
     SET is_read = true, read_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [messageId, userId]
  );
}

/**
 * 标记所有消息已读
 */
export async function markAllMessagesRead(userId: number): Promise<void> {
  await query(
    `UPDATE oa_in_app_messages
     SET is_read = true, read_at = NOW()
     WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
}

/**
 * 标记抄送已读
 */
export async function markCcRead(instanceId: number, userId: number): Promise<void> {
  await query(
    `UPDATE oa_approval_cc
     SET read_at = NOW()
     WHERE instance_id = $1 AND user_id = $2`,
    [instanceId, userId]
  );
}
