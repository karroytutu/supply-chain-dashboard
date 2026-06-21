/**
 * OA流程交接 - 执行服务
 * 在事务中批量转移在途审批单的审批人
 * @module services/oa/handover/handover-executor
 *
 * 注：流程定义交接已停用（workflowDef 改为代码唯一来源，
 * 且所有表单均使用 roleCode，流程定义层无用户级交接需求）。
 * 交接仅作用于在途审批单的节点重分配。
 */

import { createLogger } from '../../../utils/logger';
const log = createLogger('HandoverExecutor');

import { appQuery as query } from '../../../db/appPool';
import { transaction } from '../mutations/shared-utils';
import {
  enqueueCompleteApprovalTodo,
  enqueueSendApprovalNotification,
} from '../oa-async-task.service';

// =====================================================
// 类型定义
// =====================================================

export interface HandoverExecuteParams {
  sourceUserId: number;
  targetUserId: number;
  /** 选定的在途节点 ID（前端传来的是 nodeId）；空数组 = 不交接在途节点；undefined = 交接全部在途节点 */
  instanceIds?: number[];
  /** 是否同时交接在途实例（默认 true） */
  includeInFlightInstances?: boolean;
}

export interface HandoverExecuteResult {
  handoverId: number;
  instancesUpdated: number;
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
  const { sourceUserId, targetUserId, instanceIds, includeInFlightInstances = true } = params;

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

  // 2. 事务内执行在途节点交接（读取 + 写入在同一事务，避免 TOCTOU 竞态）
  const result = await transaction(async client => {
    // Advisory lock 防止并发交接冲突
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`oa:handover:${sourceUserId}`]);

    let instancesUpdated = 0;
    let affectedInstanceIds: number[] = [];

    if (includeInFlightInstances) {
      // 判断交接过滤模式：
      // - instanceIds 为显式数组（含空数组）→ 按节点 ID 精确过滤；空数组则跳过在途交接
      // - instanceIds 为 undefined → 交接该用户所有 pending 节点
      const explicitNodeFilter = Array.isArray(instanceIds);
      const skipInFlight = explicitNodeFilter && instanceIds.length === 0;

      if (!skipInFlight) {
        // 构建动态 WHERE 条件链
        const extraConditions: string[] = [];
        const dynamicParams: unknown[] = [sourceUserId]; // $1 始终为 sourceUserId

        if (explicitNodeFilter) {
          // 按用户勾选的节点 ID 过滤
          dynamicParams.push(instanceIds);
          extraConditions.push(`AND id = ANY($${dynamicParams.length})`);
        }

        const extraConditionSQL = extraConditions.length > 0
          ? extraConditions.join(' ')
          : '';

        // Step A+B 合并：使用 UPDATE...RETURNING 获取实际被更新的节点详情
        // 解决 SELECT-then-UPDATE 的 TOCTOU 竞态问题，确保 action 记录只对应实际被更新的节点
        const updateResult = await client.query<{
          id: number;
          instance_id: number;
          node_order: number;
          node_name: string;
        }>(
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
               SELECT i.id FROM oa_approval_instances i WHERE i.status = 'pending'
             )
             ${extraConditionSQL}
           RETURNING id, instance_id, node_order, node_name`,
          [targetUserId, targetUserName, sourceUserId, ...dynamicParams]
        );

        const actuallyUpdatedNodes = updateResult.rows;

        if (actuallyUpdatedNodes.length > 0) {
          // 在 JS 层对 instance_id 去重（RETURNING 不支持 DISTINCT）
          affectedInstanceIds = [...new Set(actuallyUpdatedNodes.map(r => r.instance_id))];
          instancesUpdated = affectedInstanceIds.length;

          // Step C: 批量插入 handover action 记录（使用 unnest 避免 N+1）
          const commentText = `由管理员${operatorName}将审批人从${sourceUserName}交接给${targetUserName}`;
          const actionInstanceIds = actuallyUpdatedNodes.map(n => n.instance_id);
          const actionNodeOrders = actuallyUpdatedNodes.map(n => n.node_order);
          const actionDetails = actuallyUpdatedNodes.map(n =>
            JSON.stringify({
              sourceUserId,
              sourceUserName,
              targetUserId,
              targetUserName,
              operatorName,
              nodeName: n.node_name,
            })
          );

          await client.query(
            `INSERT INTO oa_approval_actions
               (instance_id, action_type, operator_id, operator_name, node_order, comment, details)
             SELECT unnest($1::int[]), 'handover', $2, $3, unnest($4::int[]), $5, unnest($6::jsonb[])`,
            [actionInstanceIds, operatorId, operatorName, actionNodeOrders, commentText, actionDetails]
          );
        }
      }
    }

    // 没有在途实例时，无需交接
    if (instancesUpdated === 0) {
      throw new Error('没有在途审批单需要交接');
    }

    // 记录审计日志（含受影响实例 ID 列表，便于追溯交接影响范围）
    const logResult = await client.query<{ id: number }>(
      `INSERT INTO oa_workflow_handovers
         (source_user_id, source_user_name, target_user_id, target_user_name,
          operator_id, operator_name, form_types_updated, instances_updated,
          nodes_reassigned, affected_form_type_codes, details, affected_instance_ids)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 0, '{}', '[]'::jsonb, $8)
       RETURNING id`,
      [
        sourceUserId, sourceUserName, targetUserId, targetUserName,
        operatorId, operatorName, instancesUpdated,
        affectedInstanceIds,
      ]
    );

    return {
      handoverId: logResult.rows[0].id,
      instancesUpdated,
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

  log.info(`流程交接完成: ${sourceUserName} → ${targetUserName}, 实例=${result.instancesUpdated}`);

  return {
    handoverId: result.handoverId,
    instancesUpdated: result.instancesUpdated,
  };
}
