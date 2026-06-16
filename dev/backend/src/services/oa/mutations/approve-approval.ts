/**
 * OA - 同意操作
 * @module services/oa/mutations/approve-approval
 */
import { createLogger } from '../../../utils/logger';
const log = createLogger('OA');

import { FormTypeDefinition, OaInstanceRow, OaNodeRow } from '../oa.types';
import { validateInputData, isCurrentApprover, getCurrentApproverNode } from '../oa-utils';
import { getFormTypeByCode } from '../form-types';
import { transaction, mergeFormData } from './shared-utils';
import {
  executeAutoNodeCallback,
  sendApprovalNotifications,
  triggerCcIfApplicable,
} from './auto-node-operations';
import { completeApprovalTodo, finalizeProcessInstance } from '../oa-process-centre';

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
  inputData?: Record<string, unknown>
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

  await transaction(async client => {
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

    // inputData 合并到 form_data（所有节点类型通用）
    if (inputData && Object.keys(inputData).length > 0) {
      // data_input 节点额外执行 input_schema 校验和 input_data 存储
      if (currentNode.node_type === 'data_input') {
        if (currentNode.input_schema) {
          const inputErrors = validateInputData(currentNode.input_schema, inputData);
          if (inputErrors.length > 0) {
            throw new Error(`录入数据校验失败: ${inputErrors.join('; ')}`);
          }
        }
        await client.query(`UPDATE oa_approval_nodes SET input_data = $1 WHERE id = $2`, [
          JSON.stringify(inputData),
          currentNode.id,
        ]);
      }

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
    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order, comment, details)
       VALUES ($1, 'approve', $2, $3, $4, $5, $6)`,
      [
        instanceId,
        userId,
        userName,
        currentNode.node_order,
        null,
        inputData ? JSON.stringify({ inputData }) : null,
      ]
    );

    // 如果用户填写了审批意见，作为独立 comment 记录插入（统一评论模型）
    if (comment && comment.trim()) {
      await client.query(
        `INSERT INTO oa_approval_actions
          (instance_id, action_type, operator_id, operator_name, node_order, comment)
         VALUES ($1, 'comment', $2, $3, $4, $5)`,
        [instanceId, userId, userName, currentNode.node_order, comment.trim()]
      );
    }

    // 多人环节签署模式处理
    if (currentNode.sign_mode !== null) {
      if (currentNode.sign_mode === 'or') {
        // 或签：任一人通过 → 同 order 其他 pending 标记为 skipped
        await client.query(
          `UPDATE oa_approval_nodes SET status = 'skipped', acted_at = NOW()
           WHERE instance_id = $1 AND node_order = $2 AND id != $3 AND status = 'pending'`,
          [instanceId, currentNode.node_order, currentNode.id]
        );
      } else {
        // 会签：检查同 order 是否全部 approved
        const remaining = await client.query<{ count: string }>(
          `SELECT COUNT(*) as count FROM oa_approval_nodes
           WHERE instance_id = $1 AND node_order = $2 AND id != $3 AND status != 'approved'`,
          [instanceId, currentNode.node_order, currentNode.id]
        );
        if (parseInt(remaining.rows[0].count) > 0) {
          // 还有人未通过 → 操作日志已记录，事务正常提交，但不流转到下一环节
          return;
        }
      }
    }

    const instanceResult = await client.query<OaInstanceRow>(
      `SELECT * FROM oa_approval_instances WHERE id = $1`,
      [instanceId]
    );
    const instance = instanceResult.rows[0];

    const nextNodeResult = await client.query<OaNodeRow>(
      `SELECT * FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_order > $2 AND status = 'pending'
       ORDER BY node_order LIMIT 1`,
      [instanceId, currentNode.node_order]
    );

    if (nextNodeResult.rows.length > 0) {
      const nextNode = nextNodeResult.rows[0];
      if (nextNode.node_type === 'auto') {
        await client.query(
          `UPDATE oa_approval_instances
           SET erp_meta = $1, current_node_order = $2, status = 'processing', updated_at = NOW()
           WHERE id = $3`,
          [
            JSON.stringify({
              status: 'processing',
              responseData: {},
              requestLog: null,
              applicationNo: '',
              retries: 0,
            }),
            nextNode.node_order,
            instanceId,
          ]
        );
        autoNodeToExecute = nextNode;
      } else {
        await client.query(
          `UPDATE oa_approval_instances SET current_node_order = $1, updated_at = NOW() WHERE id = $2`,
          [nextNode.node_order, instanceId]
        );
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

  // 事务提交后触发回调
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

    if (autoNodeToExecute && formType.onApproved) {
      const autoNode = autoNodeToExecute as OaNodeRow;
      setImmediate(() => {
        executeAutoNodeCallback(
          instanceId,
          autoNode,
          formType!,
          callbackInstance!,
          callbackFormData || {}
        ).catch(err => log.error(`executeAutoNodeCallback 顶层错误:`, err));
      });
    } else if (isLastNode && formType.onApproved && !hasErpFailed) {
      formType.onApproved(callbackInstance, callbackFormData || {}).catch(err => {
        log.error(`审批通过回调执行失败 [${ftCode}]:`, err);
      });
    }
  }

  // 异步发送通知和检查抄送
  if (callbackInstance && formType) {
    setImmediate(() => {
      // 新增：完成当前审批人的钉钉待办
      completeApprovalTodo(instanceId, userId, 'AGREE').catch(err => {
        log.error('完成钉钉待办失败:', err);
      });
      sendApprovalNotifications(
        instanceId,
        userId,
        userName,
        callbackInstance!,
        formType!,
        isLastNode
      ).catch(err => {
        log.error('审批通知发送失败:', err);
      });
      triggerCcIfApplicable(instanceId, callbackNodeOrder, formType!, callbackInstance!).catch(
        err => {
          log.error('CC 触发失败:', err);
        }
      );
      // 最后一个节点通过时，完成壳实例（仅在审批真正通过时执行）
      if (isLastNode && !hasErpFailed) {
        finalizeProcessInstance(instanceId, 'agree').catch(err => {
          log.error('完成壳实例失败:', err);
        });
      }
    });
  }

  if (autoNodeToExecute) {
    return { status: 'processing' };
  }
  if (hasErpFailed) {
    return { status: 'erp_failed' };
  }
  return { status: 'approved' };
}
