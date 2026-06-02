/**
 * OA审批 - 工作流与审批人解析工具
 * @module services/oa-approval/oa-approval-workflow-utils
 */

import { appQuery as query } from '../../db/appPool';
import type {
  WorkflowNodeDef,
  FormTypeDefinition,
} from './oa-approval.types';
import { checkCondition } from './oa-approval-form-utils';

// =====================================================
// 节点条件过滤
// =====================================================

/**
 * 根据条件过滤审批节点
 */
export function filterNodesByCondition(
  nodes: WorkflowNodeDef[],
  formData: Record<string, unknown>
): WorkflowNodeDef[] {
  return nodes.filter(node => {
    if (!node.condition) return true;
    return checkCondition(node.condition, formData);
  });
}

// =====================================================
// 审批人解析
// =====================================================

/**
 * 解析审批节点的审批人
 */
export async function resolveApproverId(
  node: WorkflowNodeDef,
  applicantId: number
): Promise<number | null> {
  if (node.type === 'specific_user' && node.userId) {
    return node.userId;
  }

  if (node.type === 'role' && node.roleCode) {
    const result = await query<{ user_id: number }>(
      `SELECT ur.user_id FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE r.code = $1 AND r.status = 1
       LIMIT 1`,
      [node.roleCode]
    );
    return result.rows[0]?.user_id || null;
  }

  if (node.type === 'dynamic_supervisor') {
    const result = await query<{ manager_id: number }>(
      `SELECT u2.id as manager_id
       FROM users u1
       JOIN users u2 ON u2.department_id = u1.department_id
       JOIN user_roles ur ON ur.user_id = u2.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u1.id = $1 AND r.code = 'manager' AND r.status = 1
       LIMIT 1`,
      [applicantId]
    );
    return result.rows[0]?.manager_id || null;
  }

  return null;
}

/**
 * 根据角色编码查找用户ID列表
 */
export async function findUserIdsByRoleCodes(roleCodes: string[]): Promise<number[]> {
  if (!roleCodes || roleCodes.length === 0) return [];

  const result = await query<{ user_id: number }>(
    `SELECT DISTINCT ur.user_id
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE r.code = ANY($1) AND r.status = 1`,
    [roleCodes]
  );

  return result.rows.map((row) => row.user_id);
}
