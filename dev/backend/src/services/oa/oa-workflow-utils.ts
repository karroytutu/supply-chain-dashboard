/**
 * OA - 工作流与审批人解析工具
 * @module services/oa/oa-workflow-utils
 */

import { appQuery as query } from '../../db/appPool';
import { ROLE_CODES } from '../../utils/constants';
import { createLogger } from '../../utils/logger';
import type { PoolClient } from 'pg';
import type { WorkflowNodeDef, SignMode, FormTypeDefinition, OaNodeRow } from './oa.types';
import { checkCondition } from './oa-form-utils';

const log = createLogger('OA-Workflow');

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
  applicantId: number,
  formData?: Record<string, unknown>
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
  if (handler.useApplicant) {
    userIds.push(applicantId);
  }
  if (handler.formDataUserIdField) {
    const rawUserId = formData?.[handler.formDataUserIdField];
    const parsedId = Number(rawUserId);
    if (rawUserId != null && !isNaN(parsedId) && parsedId > 0) {
      userIds.push(parsedId);
    } else {
      log.warn(`formDataUserIdField '${handler.formDataUserIdField}' 值无效: ${rawUserId}，节点 '${node.name}' 可能无人处理`);
    }
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
  if (result.rows.length === 0) {
    log.warn(`岗位 '${roleCode}' 下无活跃用户，审批节点可能无人处理`);
  }
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
     WHERE u1.id = $1 AND r.code = $2 AND r.status = 1`,
    [applicantId, ROLE_CODES.DEPARTMENT_MANAGER]
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

// =====================================================
// 按需节点创建（条件驱动 + 即时写入）
// =====================================================

/**
 * 评估后续节点条件并按需创建满足条件的节点
 *
 * 核心逻辑：
 * 1. 查询 DB 中已存在的最大 node_order
 * 2. 遍历 workflowDef.nodes（按 order 升序）
 * 3. 跳过 order <= max(已有最大order, afterNodeOrder) 的节点
 * 4. 评估 node.condition：无 condition = 条件满足
 * 5. 条件满足 → 创建节点（auto/cc 无处理人，approval/handle 通过 resolveHandlerRule 解析）
 * 6. 条件不满足 → 不创建
 * 7. 返回新创建的节点列表
 */
export async function evaluateAndTriggerNodes(
  client: PoolClient,
  instanceId: number,
  formType: FormTypeDefinition,
  formData: Record<string, unknown>,
  applicantId: number,
  afterNodeOrder: number
): Promise<OaNodeRow[]> {
  // 1. 查询 DB 中已存在的最大 node_order
  const maxOrderResult = await client.query<{ max_order: number | null }>(
    `SELECT MAX(node_order) AS max_order FROM oa_approval_nodes WHERE instance_id = $1`,
    [instanceId]
  );
  const dbMaxOrder = maxOrderResult.rows[0]?.max_order ?? 0;
  const skipBelowOrder = Math.max(dbMaxOrder, afterNodeOrder);

  log.info(
    `[evaluateAndTriggerNodes] instanceId=${instanceId}, formType=${formType.code}, ` +
    `afterNodeOrder=${afterNodeOrder}, dbMaxOrder=${dbMaxOrder}, skipBelowOrder=${skipBelowOrder}`
  );

  // 2. 按 order 升序遍历 workflowDef.nodes
  const sortedNodes = [...formType.workflowDef.nodes].sort((a, b) => a.order - b.order);
  const createdNodes: OaNodeRow[] = [];

  for (const nodeDef of sortedNodes) {
    // 3. 跳过已经存在或已经处理过的节点
    if (nodeDef.order <= skipBelowOrder) continue;

    // 4. 评估条件
    const conditionMet = nodeDef.condition
      ? checkCondition(nodeDef.condition, formData)
      : true;

    if (nodeDef.condition && !conditionMet) {
      const cond = nodeDef.condition;
      const condField = !Array.isArray(cond) && 'field' in cond ? cond.field : JSON.stringify(cond);
      const condValue = !Array.isArray(cond) && 'field' in cond ? formData[cond.field] : '(complex)';
      log.info(
        `[evaluateAndTriggerNodes] node=${nodeDef.order}(${nodeDef.name}): ` +
        `condition field="${condField}", value=${JSON.stringify(condValue)}, ` +
        `conditionMet=${conditionMet}`
      );
    }

    // 6. 条件不满足 → 不创建
    if (!conditionMet) continue;

    // 5. 条件满足 → 创建节点
    const deadlineAt = nodeDef.timeout
      ? new Date(Date.now() + nodeDef.timeout.durationMinutes * 60000)
      : null;
    const timeoutConfigJson = nodeDef.timeout
      ? JSON.stringify(nodeDef.timeout)
      : null;

    if (nodeDef.type === 'auto' || nodeDef.type === 'cc') {
      // auto/cc 节点：无处理人
      const insertResult = await client.query<OaNodeRow>(
        `INSERT INTO oa_approval_nodes
          (instance_id, node_order, round, node_name, node_type, role_code,
           assigned_user_ids, status, sign_mode, deadline_at, timeout_config)
         VALUES ($1, $2, COALESCE((SELECT MAX(round) FROM oa_approval_nodes WHERE instance_id = $1 AND node_order = $2), 0) + 1,
                 $3, $4, $5, NULL, 'pending', $6, $7, $8)
         RETURNING *`,
        [
          instanceId,
          nodeDef.order,
          nodeDef.name,
          nodeDef.type,
          nodeDef.handler?.roleCode || null,
          nodeDef.signMode || null,
          deadlineAt,
          timeoutConfigJson,
        ]
      );
      createdNodes.push(insertResult.rows[0]);
    } else {
      // approval/handle 节点：解析处理人
      const { userIds, signMode } = await resolveHandlerRule(nodeDef, applicantId, formData);

      const insertResult = await client.query<OaNodeRow>(
        `INSERT INTO oa_approval_nodes
          (instance_id, node_order, round, node_name, node_type, role_code,
           assigned_user_ids, status, sign_mode, deadline_at, timeout_config)
         VALUES ($1, $2, COALESCE((SELECT MAX(round) FROM oa_approval_nodes WHERE instance_id = $1 AND node_order = $2), 0) + 1,
                 $3, $4, $5, $6, 'pending', $7, $8, $9)
         RETURNING *`,
        [
          instanceId,
          nodeDef.order,
          nodeDef.name,
          nodeDef.type,
          nodeDef.handler?.roleCode || null,
          userIds.length > 0 ? userIds : null,
          signMode,
          deadlineAt,
          timeoutConfigJson,
        ]
      );
      createdNodes.push(insertResult.rows[0]);
    }
  }

  if (createdNodes.length > 0) {
    log.info(
      `[evaluateAndTriggerNodes] instanceId=${instanceId}: created ${createdNodes.length} nodes: ` +
      createdNodes.map(n => `${n.node_order}(${n.node_name})`).join(', ')
    );
  }

  return createdNodes;
}
