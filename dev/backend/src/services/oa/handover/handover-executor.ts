/**
 * OA流程交接 - 执行服务
 * 在事务中批量替换流程定义中的审批人，并转移在途审批单
 * @module services/oa/handover/handover-executor
 */

import { createLogger } from '../../../utils/logger';
const log = createLogger('HandoverExecutor');

import { appQuery as query } from '../../../db/appPool';
import { transaction } from '../mutations/shared-utils';
import {
  enqueueCompleteApprovalTodo,
  enqueueSendApprovalNotification,
} from '../oa-async-task.service';
import type { WorkflowDef } from '../oa.types';

// =====================================================
// 类型定义
// =====================================================

export interface HandoverExecuteParams {
  sourceUserId: number;
  targetUserId: number;
  /** 选定的表单类型编码（不传则交接所有受影响的表单） */
  formTypeCodes?: string[];
  /** 是否同时交接在途实例（默认 true） */
  includeInFlightInstances?: boolean;
}

export interface HandoverExecuteResult {
  handoverId: number;
  formTypesUpdated: number;
  instancesUpdated: number;
  nodesReassigned: number;
}

// =====================================================
// 执行交接
// =====================================================

/**
 * 执行流程交接
 */
export async function executeHandover(
  params: HandoverExecuteParams,
  operatorId: number,
  operatorName: string
): Promise<HandoverExecuteResult> {
  const { sourceUserId, targetUserId, formTypeCodes, includeInFlightInstances = true } = params;

  // 1. 校验用户存在性
  const [sourceUser, targetUser] = await Promise.all([
    query<{ id: number; name: string }>(`SELECT id, name FROM users WHERE id = $1`, [sourceUserId]),
    query<{ id: number; name: string; status: number }>(`SELECT id, name, status FROM users WHERE id = $1`, [targetUserId]),
  ]);

  if (sourceUser.rows.length === 0) throw new Error('被交接人不存在');
  if (targetUser.rows.length === 0) throw new Error('交接人不存在');
  if (targetUser.rows[0].status !== 1) throw new Error('交接人账号已禁用，无法接收交接');
  if (sourceUserId === targetUserId) throw new Error('被交接人和交接人不能是同一人');

  const sourceUserName = sourceUser.rows[0].name;
  const targetUserName = targetUser.rows[0].name;

  // 2. 事务内执行所有更新（读取 + 写入在同一事务，避免 TOCTOU 竞态）
  const result = await transaction(async client => {
    // Advisory lock 防止并发交接冲突
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`oa:handover:${sourceUserId}`]);

    // 2.1 在事务内查询受影响的表单类型（保证读取和写入一致性）
    const formTypesResult = await client.query<{ code: string; name: string; workflow_def: WorkflowDef }>(
      `SELECT code, name, workflow_def FROM oa_form_types WHERE is_active = true`
    );

    const affectedFormTypes = formTypesResult.rows.filter(row => {
      const nodes = row.workflow_def?.nodes || [];
      const hasMatch = nodes.some(n => n.handler?.userId === sourceUserId);
      if (formTypeCodes && formTypeCodes.length > 0) {
        return hasMatch && formTypeCodes.includes(row.code);
      }
      return hasMatch;
    });

    if (affectedFormTypes.length === 0) {
      throw new Error('没有受影响的流程定义需要交接');
    }

    let formTypesUpdated = 0;
    let nodesReassigned = 0;
    const updatedCodes: string[] = [];
    const details: Array<{ code: string; name: string; replacedNodes: Array<{ order: number; name: string }> }> = [];

    // 3.1 更新流程定义中的 handler.userId
    for (const ft of affectedFormTypes) {
      const newWorkflowDef = JSON.parse(JSON.stringify(ft.workflow_def));
      const replacedNodes: Array<{ order: number; name: string }> = [];

      for (const node of newWorkflowDef.nodes) {
        if (node.handler?.userId === sourceUserId) {
          node.handler.userId = targetUserId;
          replacedNodes.push({ order: node.order, name: node.name });
        }
      }

      if (replacedNodes.length > 0) {
        await client.query(
          `UPDATE oa_form_types SET workflow_def = $1::jsonb, version = version + 1, updated_at = NOW() WHERE code = $2`,
          [JSON.stringify(newWorkflowDef), ft.code]
        );
        formTypesUpdated++;
        nodesReassigned += replacedNodes.length;
        updatedCodes.push(ft.code);
        details.push({ code: ft.code, name: ft.name, replacedNodes });
      }
    }

    // 3.2 更新在途实例的 pending 节点
    let instancesUpdated = 0;
    let affectedInstanceIds: number[] = [];

    if (includeInFlightInstances) {
      const nodesResult = await client.query<{ instance_id: number }>(
        `UPDATE oa_approval_nodes
         SET assigned_user_id = $1, assigned_user_name = $2,
             reminder_count = 0, last_reminder_at = NULL, cc_supervisor_at = NULL,
             deadline_at = CASE
               WHEN timeout_config IS NOT NULL
               THEN NOW() + ((timeout_config->>'durationMinutes')::int * interval '1 minute')
               ELSE NULL
             END,
             updated_at = NOW()
         WHERE assigned_user_id = $3 AND status = 'pending'
           AND instance_id IN (
             SELECT i.id FROM oa_approval_instances i
             JOIN oa_form_types ft ON ft.id = i.form_type_id
             WHERE ft.code = ANY($4) AND i.status = 'pending'
           )
         RETURNING DISTINCT instance_id`,
        [targetUserId, targetUserName, sourceUserId, updatedCodes]
      );
      instancesUpdated = nodesResult.rows.length;
      affectedInstanceIds = nodesResult.rows.map(r => r.instance_id);
    }

    // 3.3 记录审计日志
    const logResult = await client.query<{ id: number }>(
      `INSERT INTO oa_workflow_handovers
         (source_user_id, source_user_name, target_user_id, target_user_name,
          operator_id, operator_name, form_types_updated, instances_updated,
          nodes_reassigned, affected_form_type_codes, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        sourceUserId, sourceUserName, targetUserId, targetUserName,
        operatorId, operatorName, formTypesUpdated, instancesUpdated,
        nodesReassigned, updatedCodes, JSON.stringify(details),
      ]
    );

    return {
      handoverId: logResult.rows[0].id,
      formTypesUpdated,
      instancesUpdated,
      nodesReassigned,
      affectedInstanceIds,
    };
  });

  // 4. 事务外异步发送钉钉通知
  if (includeInFlightInstances && result.affectedInstanceIds.length > 0) {
    setImmediate(() => {
      for (const instanceId of result.affectedInstanceIds) {
        // 完成被交接人的钉钉待办
        enqueueCompleteApprovalTodo(instanceId, sourceUserId, 'AGREE').catch(err => {
          log.error(`完成被交接人钉钉待办失败 [instanceId=${instanceId}]:`, err);
        });
        // 为交接人创建新待办 + 发送通知
        enqueueSendApprovalNotification('transferred', instanceId, {
          transferToUserId: targetUserId,
          fromUserName: sourceUserName,
        }).catch(err => {
          log.error(`交接通知入队失败 [instanceId=${instanceId}]:`, err);
        });
      }
    });
  }

  log.info(`流程交接完成: ${sourceUserName} → ${targetUserName}, 表单=${result.formTypesUpdated}, 实例=${result.instancesUpdated}, 节点=${result.nodesReassigned}`);

  return {
    handoverId: result.handoverId,
    formTypesUpdated: result.formTypesUpdated,
    instancesUpdated: result.instancesUpdated,
    nodesReassigned: result.nodesReassigned,
  };
}
