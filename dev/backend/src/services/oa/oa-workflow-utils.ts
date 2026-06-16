/**
 * OA - 工作流与审批人解析工具
 * @module services/oa/oa-workflow-utils
 */

import { appQuery as query } from '../../db/appPool';
import type { WorkflowNodeDef, SignMode } from './oa.types';
import { checkCondition } from './oa-form-utils';

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
// 处理人解析
// =====================================================

/**
 * 解析环节的处理人规则，返回所有匹配用户 + 签署模式
 */
export async function resolveHandlerRule(
  node: WorkflowNodeDef,
  applicantId: number
): Promise<{ userIds: number[]; signMode: SignMode }> {
  const signMode = node.signMode || 'or';
  const userIds: number[] = [];
  const handler = node.handler;

  if (!handler) return { userIds: [], signMode };

  if (handler.roleCode) {
    userIds.push(...await getUsersByRoleCode(handler.roleCode));
  }
  if (handler.useSupervisor) {
    userIds.push(...await getSupervisors(applicantId));
  }
  if (handler.userId) {
    userIds.push(handler.userId);
  }

  return { userIds: [...new Set(userIds)], signMode };
}

/**
 * 查询角色下所有用户（不再 LIMIT 1）
 */
async function getUsersByRoleCode(roleCode: string): Promise<number[]> {
  const result = await query<{ user_id: number }>(
    `SELECT DISTINCT ur.user_id FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE r.code = $1 AND r.status = 1`,
    [roleCode]
  );
  return result.rows.map(r => r.user_id);
}

/**
 * 查询申请人的所有直属主管（不再 LIMIT 1）
 */
async function getSupervisors(applicantId: number): Promise<number[]> {
  const result = await query<{ id: number }>(
    `SELECT u2.id FROM users u1
     JOIN users u2 ON u2.department_id = u1.department_id
     JOIN user_roles ur ON ur.user_id = u2.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u1.id = $1 AND r.code = 'manager' AND r.status = 1`,
    [applicantId]
  );
  return result.rows.map(r => r.id);
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

  return result.rows.map(row => row.user_id);
}
