/**
 * OA - 同意操作
 * @module services/oa/mutations/approve-approval
 */
import { createLogger } from '../../../utils/logger';
const log = createLogger('OA');

import { AttachmentMeta, FormTypeDefinition, OaInstanceRow, OaNodeRow } from '../oa.types';
import { isCurrentApprover, getCurrentApproverNode } from '../oa-utils';
import { getFormTypeByCode } from '../form-types';
import { evaluateAndTriggerNodes } from '../oa-workflow-utils';
import { transaction, mergeFormData } from './shared-utils';
import {
  enqueueCompleteApprovalTodo,
  enqueueSendApprovalNotification,
  enqueueFinalizeProcessInstance,
  enqueueExecuteAutoNode,
} from '../oa-async-task.service';

import { executeAutoNodeCallback } from './auto-node-operations';
import { createFormAccessor } from '../form-accessor';
// Re-export for backward compatibility
export { executeAutoNodeCallback, retryAutoNode } from './auto-node-operations';

/**
 * 同意审批
 */
export async function approveApproval(
  instanceId: number,
  userId: number,
  userName: string,
  comment?: string,
  inputData?: Record<string, unknown>,
  attachments?: AttachmentMeta[]
): Promise<{ status: string }> {
  const canApprove = await isCurrentApprover(instanceId, userId);
  if (!canApprove) {
    throw new Error('您不是当前审批人，无法执行此操作');
  }

  let formType: FormTypeDefinition | undefined;
  let callbackInstance: OaInstanceRow | undefined;
  let callbackNodeOrder = 0;
  let callbackInputData: Record<string, unknown> | undefined;
  let callbackFormData: Record<string, unknown> | undefined;
  let isLastNode = false;
  let autoNodeToExecute: OaNodeRow | null = null;
  let hasErpFailed = false;
  let isCountersignWaiting = false;
  let nextHumanNode: { approverIds: number[]; nodeName: string; nodeOrder: number } | null = null;

  const txResult = await transaction(async client => {
    // 实例级分布式锁，防止多实例并发状态覆盖
    await client.query('SELECT pg_advisory_xact_lock($1)', [instanceId]);

    const instanceResult0 = await client.query<OaInstanceRow>(
      `SELECT * FROM oa_approval_instances WHERE id = $1 FOR UPDATE`,
      [instanceId]
    );
    const instance0 = instanceResult0.rows[0];

    // 防止重复提交：auto 节点正在处理中时拒绝重复操作
    if (instance0.status === 'processing') {
      throw new Error('审批正在自动处理中，请勿重复操作');
    }

    const formTypeCode = await client.query<{ code: string }>(
      `SELECT code FROM oa_form_types WHERE id = $1`,
      [instance0.form_type_id]
    );
    formType = formTypeCode.rows[0] ? getFormTypeByCode(formTypeCode.rows[0].code) : undefined;

    const currentNode = await getCurrentApproverNode(client, instanceId, userId);
    if (!currentNode) {
      throw new Error('未找到待审批节点');
    }

    // 审批前校验：如果表单类型定义了 beforeApprove，先执行校验
    if (formType?.beforeApprove) {
      const mergedData = inputData
        ? mergeFormData(instance0.form_data as Record<string, unknown>, inputData)
        : instance0.form_data;
      const errors = formType.beforeApprove(
        currentNode.node_order,
        createFormAccessor(mergedData as Record<string, unknown>),
        inputData
      );
      if (errors.length > 0) {
        throw new Error(`校验失败: ${errors.join('; ')}`);
      }
    }

    // inputData 合并到 form_data（所有节点类型通用，包括办理型节点）
    if (inputData && Object.keys(inputData).length > 0) {
      const currentFormData = instance0.form_data;
      const mergedFormData = mergeFormData(currentFormData as Record<string, unknown>, inputData);

      await client.query(
        `UPDATE oa_approval_instances SET form_data = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(mergedFormData), instanceId]
      );
    }

    await client.query(
      `UPDATE oa_approval_nodes SET status = 'approved', comment = NULL, acted_at = NOW() WHERE id = $1`,
      [currentNode.id]
    );

    // 先记录审批操作日志和评论（所有签署模式都需要记录，包括会签等待场景）
    // round 字段记录当前轮次，用于会签计数时按轮次过滤
    const currentRound = currentNode.round ?? 1;
    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order, comment, details, attachments, round)
       VALUES ($1, 'approve', $2, $3, $4, $5, $6, $7, $8)`,
      [
        instanceId,
        userId,
        userName,
        currentNode.node_order,
        comment?.trim() || null,
        inputData ? JSON.stringify({ inputData }) : null,
        attachments && attachments.length > 0 ? JSON.stringify(attachments) : null,
        currentRound,
      ]
    );

    // 多人环节签署模式处理
    if (currentNode.sign_mode !== null) {
      if (currentNode.sign_mode === 'or') {
        // 或签：新模型下节点只有一行（assigned_user_ids 数组），无需标记其他人 skipped
      } else {
        // 会签：检查 assigned_user_ids 中是否所有人都已 approved
        // 新模型下或签/会签都是单行，会签需要检查操作记录数
        // 按 round 过滤：退回后重走同一环节时，只统计当前轮次的 approve 记录
        const approvedCount = await client.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM oa_approval_actions
           WHERE instance_id = $1 AND node_order = $2 AND action_type = 'approve' AND round = $3`,
          [instanceId, currentNode.node_order, currentRound]
        );
        const totalApprovers = currentNode.assigned_user_ids?.length ?? 1;
        if (parseInt(approvedCount.rows[0].count) < totalApprovers) {
          // 还有人未通过 → 操作日志已记录，事务正常提交，但不流转到下一环节
          isCountersignWaiting = true;
          return { countersignWaiting: true };
        }
      }
    }

    const instanceResult = await client.query<OaInstanceRow>(
      `SELECT * FROM oa_approval_instances WHERE id = $1`,
      [instanceId]
    );
    const instance = instanceResult.rows[0];

    // 按需创建后续节点（条件评估 + 处理人解析）
    if (formType?.workflowDef?.nodes && !isCountersignWaiting) {
      const updatedFormData = (instance.form_data || {}) as Record<string, unknown>;
      await evaluateAndTriggerNodes(
        client, instanceId, formType, updatedFormData, instance.applicant_id, currentNode.node_order
      );
    }

    const nextNodeResult = await client.query<OaNodeRow>(
      `SELECT DISTINCT ON (node_order) * FROM oa_approval_nodes
       WHERE instance_id = $1 AND status = 'pending'
       ORDER BY node_order, round DESC
       LIMIT 1`,
      [instanceId]
    );

    if (nextNodeResult.rows.length > 0) {
      const nextNode = nextNodeResult.rows[0];
      if (nextNode.node_type === 'auto' || nextNode.node_type === 'cc') {
        // auto/cc 节点需设置 erp_meta（仅 auto 节点）
        if (nextNode.node_type === 'auto') {
          await client.query(
            `UPDATE oa_approval_instances
             SET current_node_order = $1, status = 'processing', updated_at = NOW(),
                 erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"processing"')
             WHERE id = $2`,
            [nextNode.node_order, instanceId]
          );
        } else {
          await client.query(
            `UPDATE oa_approval_instances
             SET current_node_order = $1, status = 'processing', updated_at = NOW()
             WHERE id = $2`,
            [nextNode.node_order, instanceId]
          );
        }
        autoNodeToExecute = nextNode;
      } else {
        await client.query(
          `UPDATE oa_approval_instances SET current_node_order = $1, updated_at = NOW() WHERE id = $2`,
          [nextNode.node_order, instanceId]
        );
        // 记录下一人工节点信息，用于事务后发送待审批通知
        const approverIds = Array.isArray(nextNode.assigned_user_ids) ? nextNode.assigned_user_ids : [];
        nextHumanNode = { approverIds, nodeName: nextNode.node_name, nodeOrder: nextNode.node_order };
      }
    } else {
      // 无后续 pending 节点，准备标记实例完成
      // 防御检查：确认没有 failed 状态的 auto 节点被跳过
      const failedAutoCheck = await client.query(
        `SELECT id, node_name, comment FROM oa_approval_nodes
         WHERE instance_id = $1 AND node_type = 'auto' AND status = 'failed'
         LIMIT 1`,
        [instanceId]
      );
      if (failedAutoCheck.rows.length > 0) {
        // 存在失败的 auto 节点，标记为 erp_failed 等待人工介入
        hasErpFailed = true;
        const failedNode = failedAutoCheck.rows[0];
        await client.query(
          `UPDATE oa_approval_instances
           SET status = 'erp_failed', updated_at = NOW(),
               erp_meta = jsonb_set(
                 COALESCE(erp_meta, '{}'),
                 '{status,requestLog}',
                 '["erp_failed", {"error": $2, "source": "approve_defense_check"}]'::jsonb
               )
           WHERE id = $1`,
          [instanceId, `Auto node "${failedNode.node_name}" failed: ${failedNode.comment || 'unknown'}`]
        );
      } else {
        await client.query(
          `UPDATE oa_approval_instances SET status = 'approved', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [instanceId]
        );
      }
    }

    callbackInstance = instance;
    callbackNodeOrder = currentNode.node_order;
    callbackInputData = inputData;
    callbackFormData = instance.form_data as Record<string, unknown>;
    isLastNode = nextNodeResult.rows.length === 0;
  });

  // 事务提交后触发业务回调（保持同步执行，错误不阻塞流程）
  if (callbackInstance && formType) {
    const ftCode = formType.code;
    if (callbackInputData && formType.onNodeCompleted) {
      formType
        .onNodeCompleted(
          callbackInstance,
          callbackNodeOrder,
          callbackInputData,
          callbackFormData || {}
        )
        .catch(err => {
          log.error(`节点回调执行失败 [${ftCode} node=${callbackNodeOrder}]:`, err);
        });
    }

    if (autoNodeToExecute) {
      const _autoNode = autoNodeToExecute as OaNodeRow;
    
      // 路径 A（快）：setImmediate 立即执行，幂等 claim 保证与 Worker 不重复
      setImmediate(() => {
        executeAutoNodeCallback(instanceId, _autoNode, formType!, callbackInstance!, (callbackFormData || {}))
          .catch(err => log.error(`auto/cc节点立即执行失败 [instanceId=${instanceId}]:`, err));
      });
    
      // 路径 B（兗底）：仍入队异步任务，claim 机制保证幂等——立即执行成功则 Worker 跳过
      enqueueExecuteAutoNode(instanceId, _autoNode.id).catch(err =>
        log.error(`auto/cc节点任务入队失败 [instanceId=${instanceId}]:`, err)
      );
    } else if (isLastNode && formType.onApproved && !hasErpFailed) {
      formType.onApproved(callbackInstance, createFormAccessor(callbackFormData || {})).catch(err => {
        log.error(`审批通过回调执行失败 [${ftCode}]:`, err);
      });
    }
  }

  // 异步操作写入任务表：完成钉钉待办、发送通知、完成壳实例
  if (callbackInstance && formType) {
    setImmediate(() => {
      enqueueCompleteApprovalTodo(instanceId, userId, 'AGREE').catch(err => {
        log.error('完成钉钉待办任务入队失败:', err);
      });

      // 区分通知类型：末节点通过 → 通知申请人；非末节点 → 通知下一审批人
      if (isLastNode && !hasErpFailed) {
        enqueueSendApprovalNotification('approved', instanceId, {
          operatorId: userId, operatorName: userName, nodeOrder: callbackNodeOrder,
        }).catch(err => {
          log.error('审批通过通知任务入队失败:', err);
        });
      } else if (nextHumanNode && nextHumanNode.approverIds.length > 0) {
        enqueueSendApprovalNotification('pending', instanceId, {
          approverIds: nextHumanNode.approverIds,
          nodeName: nextHumanNode.nodeName,
          nodeOrder: nextHumanNode.nodeOrder,
        }).catch(err => {
          log.error('待审批通知任务入队失败:', err);
        });
      }
      // 最后一个节点通过时，完成壳实例（仅在审批真正通过时执行）
      if (isLastNode && !hasErpFailed) {
        enqueueFinalizeProcessInstance(instanceId, 'agree').catch(err => {
          log.error('完成壳实例任务入队失败:', err);
        });
      }
    });
  }

  if (isCountersignWaiting) {
    return { status: 'pending' };
  }
  if (autoNodeToExecute) {
    return { status: 'processing' };
  }
  if (hasErpFailed) {
    return { status: 'erp_failed' };
  }
  return { status: 'approved' };
}
