/**
 * OA - 自动节点操作（执行 + 重试）
 * @module services/oa/mutations/auto-node-operations
 */
import { createLogger } from '../../../utils/logger';
const log = createLogger('OA');

import { appQuery as query } from '../../../db/appPool';
import { FormTypeDefinition, OaInstanceRow, OaNodeRow, ApprovalStatus } from '../oa.types';
import { getFormTypeByCode } from '../form-types';
import { notifyPendingApproval, notifyApproved, notifyCc } from '../oa-notify';
import { finalizeProcessInstance } from '../oa-process-centre';
import { findUserIdsByRoleCodes } from '../oa-utils';
import { transaction, getInstanceNotifyData } from './shared-utils';

/**
 * 通用 auto 节点异步执行器
 * 所有含 auto 节点的表单类型共用此执行契约：
 * 1. 标记 auto 节点为 processing
 * 2. 执行 formType.onApproved()
 * 3. 成功：auto 节点 → approved，实例 → approved
 * 4. 失败：安全网 markErpFailed()，auto 节点 → failed，实例 → erp_failed
 */
export async function executeAutoNodeCallback(
  instanceId: number,
  autoNode: OaNodeRow,
  formType: FormTypeDefinition,
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  try {
    // 幂等保护：仅当节点处于 pending/failed 时才标记为 processing
    const claimResult = await query(
      `UPDATE oa_approval_nodes SET status = 'processing', acted_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'failed')`,
      [autoNode.id]
    );
    if (claimResult.rowCount === 0) {
      log.warn(`auto节点已被其他进程处理，跳过 [nodeId=${autoNode.id}]`);
      return;
    }

    await formType.onApproved!(instance, formData);

    // 成功：auto 节点 → approved
    await query(`UPDATE oa_approval_nodes SET status = 'approved' WHERE id = $1`, [autoNode.id]);

    // 检查是否需要在 auto 节点通过后触发抄送
    await triggerCcIfApplicable(instanceId, autoNode.node_order, formType, instance);

    // 检查是否有下一个待审批节点（全局搜索所有 pending 节点，不限于 auto 节点之后的位置）
    // 注意：不排除 auto 类型，因为现有代码在第 61 行有递归处理连续 auto 节点的逻辑
    const nextNodeResult = await query<OaNodeRow>(
      `SELECT * FROM oa_approval_nodes
       WHERE instance_id = $1 AND status = 'pending'
       ORDER BY node_order LIMIT 1`,
      [instanceId]
    );

    if (nextNodeResult.rows.length > 0) {
      const nextNode = nextNodeResult.rows[0];
      if (nextNode.node_type === 'auto') {
        await query(
          `UPDATE oa_approval_instances
           SET current_node_order = $1, updated_at = NOW()
           WHERE id = $2`,
          [nextNode.node_order, instanceId]
        );
        await executeAutoNodeCallback(instanceId, nextNode, formType, instance, formData);
      } else {
        await query(
          `UPDATE oa_approval_instances
           SET current_node_order = $1, status = 'pending', updated_at = NOW(),
               erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"completed"')
           WHERE id = $2`,
          [nextNode.node_order, instanceId]
        );
        if (nextNode.assigned_user_id) {
          const _ftCode = formType.code;
          const ftName = formType.name;
          setImmediate(() => {
            notifyPendingApproval(
              {
                instanceId,
                instanceNo: instance.instance_no,
                title: instance.title,
                formTypeName: ftName,
                applicantName: instance.applicant_name,
                nodeName: nextNode.node_name,
                nodeOrder: nextNode.node_order,
                formSchema: formType.formSchema,
                formData,
              },
              [nextNode.assigned_user_id!]
            ).catch(err => log.error('auto节点流转通知失败:', err));
          });
        }
      }
    } else {
      await query(
        `UPDATE oa_approval_instances
         SET status = 'approved', completed_at = NOW(), updated_at = NOW(),
             erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"completed"')
         WHERE id = $1`,
        [instanceId]
      );
      // 完成钉钉流程中心壳实例（auto 节点为最后一个节点时）
      finalizeProcessInstance(instanceId, 'agree').catch(err => {
        log.error('auto节点末位完成壳实例失败:', err);
      });
      setImmediate(() => {
        notifyApproved(
          {
            instanceId,
            instanceNo: instance.instance_no,
            title: instance.title,
            formTypeName: formType.name,
            applicantName: instance.applicant_name,
            formSchema: formType.formSchema,
            formData,
          },
          instance.applicant_id
        ).catch(err => log.error('auto节点审批通过通知失败:', err));
      });
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`auto节点异步执行失败 [instanceId=${instanceId}]:`, error);

    try {
      const { markErpFailed } = await import('../../fixed-asset/erp-meta-utils');
      await markErpFailed(instanceId, { error: errMsg, source: 'auto_node_framework' });
    } catch (markErr) {
      log.error(`markErpFailed 安全网调用失败:`, markErr);
    }

    await query(`UPDATE oa_approval_nodes SET status = 'failed', comment = $1 WHERE id = $2`, [
      errMsg,
      autoNode.id,
    ]);
    await query(
      `UPDATE oa_approval_instances SET status = 'erp_failed', updated_at = NOW() WHERE id = $1`,
      [instanceId]
    );
  }
}

/**
 * 重试卡住的 auto 节点
 */
export async function retryAutoNode(instanceId: number): Promise<void> {
  const { instance: lockedInstance, autoNode } = await transaction(async client => {
    const instResult = await client.query<OaInstanceRow>(
      `SELECT * FROM oa_approval_instances WHERE id = $1 FOR UPDATE`,
      [instanceId]
    );
    const inst = instResult.rows[0];
    if (!inst) throw new Error('审批实例不存在');

    const terminalStatuses: ApprovalStatus[] = ['approved', 'rejected', 'withdrawn', 'cancelled'];
    if (terminalStatuses.includes(inst.status as ApprovalStatus)) {
      throw new Error(`审批已处于终态(${inst.status})，无法重试`);
    }
    if (inst.status === 'processing') {
      throw new Error('审批正在处理中，请稍后重试');
    }

    // 直接查找需要重试的 auto 节点（不再依赖 current_node_order，防止节点位置偏移导致找不到或找错节点）
    const nodeResult = await client.query<OaNodeRow>(
      `SELECT * FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_type = 'auto' AND status IN ('pending', 'failed')
       ORDER BY node_order LIMIT 1`,
      [instanceId]
    );
    const node = nodeResult.rows[0];
    if (!node) {
      throw new Error('未找到需要重试的 auto 节点');
    }

    // 安全检查：auto 节点之前是否仍有未完成的人工节点
    // 如果有，说明 auto 节点尚未轮到执行，不应提前触发
    const pendingBeforeCheck = await client.query(
      `SELECT id, node_name, status FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_order < $2 AND status IN ('pending', 'processing')`,
      [instanceId, node.node_order]
    );
    if (pendingBeforeCheck.rows.length > 0) {
      const blockingNode = pendingBeforeCheck.rows[0];
      throw new Error(
        `auto 节点前仍有未完成节点(${blockingNode.node_name}, ${blockingNode.status})，不应提前执行`
      );
    }

    const erpMeta = inst.erp_meta || {
      status: 'pending',
      responseData: {},
      requestLog: null,
      applicationNo: '',
      retries: 0,
    };
    erpMeta.status = 'processing';
    erpMeta.requestLog = null;

    await client.query(
      `UPDATE oa_approval_instances SET status = 'processing', erp_meta = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(erpMeta), instanceId]
    );

    await client.query(
      `UPDATE oa_approval_nodes SET status = 'pending', comment = NULL WHERE id = $1`,
      [node.id]
    );

    await client.query(
      `INSERT INTO oa_approval_actions (instance_id, node_order, action_type, operator_name, details)
       VALUES ($1, $2, 'retry_auto_node', '系统', $3)`,
      [
        instanceId,
        node.node_order,
        JSON.stringify({ source: 'retry_auto_node', message: '重试卡住的auto节点' }),
      ]
    );

    return { instance: inst, autoNode: node };
  });

  const ftResult = await query<{ code: string }>(`SELECT code FROM oa_form_types WHERE id = $1`, [
    lockedInstance.form_type_id,
  ]);
  const formType = ftResult.rows[0] ? getFormTypeByCode(ftResult.rows[0].code) : undefined;
  if (!formType?.onApproved) {
    throw new Error('未找到表单类型定义或 onApproved 回调');
  }

  const instResult = await query<OaInstanceRow>(
    `SELECT * FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );
  const freshInstance = instResult.rows[0];
  if (!freshInstance) throw new Error('审批实例不存在');

  const formData = (freshInstance.form_data || {}) as Record<string, unknown>;
  await executeAutoNodeCallback(instanceId, autoNode, formType, freshInstance, formData);
}

/**
 * 检查当前通过的节点是否为 CC 触发节点，如是则创建抄送记录并发送通知。
 */
export async function triggerCcIfApplicable(
  instanceId: number,
  approvedNodeOrder: number,
  formType: FormTypeDefinition,
  instance: OaInstanceRow
): Promise<void> {
  let ccTriggerOrder = formType.workflowDef.ccAfterNode;
  if (ccTriggerOrder === undefined) {
    const maxOrderResult = await query<{ max_order: number }>(
      `SELECT MAX(node_order) as max_order FROM oa_approval_nodes WHERE instance_id = $1`,
      [instanceId]
    );
    ccTriggerOrder = maxOrderResult.rows[0]?.max_order;
  }

  if (approvedNodeOrder !== ccTriggerOrder) return;

  const freshResult = await query<OaInstanceRow>(
    `SELECT * FROM oa_approval_instances WHERE id = $1`,
    [instanceId]
  );
  const freshInstance = freshResult.rows[0] || instance;

  const formData = freshInstance.form_data as Record<string, unknown>;
  const ccRoles = formType.getCCRoles
    ? formType.getCCRoles(formData)
    : formType.workflowDef.ccRoles;
  if (!ccRoles || ccRoles.length === 0) return;

  const ccUserIds = await findUserIdsByRoleCodes(ccRoles);
  const filteredCcUserIds = ccUserIds.filter(id => id !== freshInstance.applicant_id);
  if (filteredCcUserIds.length === 0) return;

  const usersResult = await query<{ id: number; name: string }>(
    `SELECT id, name FROM users WHERE id = ANY($1)`,
    [filteredCcUserIds]
  );
  const nameMap = new Map(usersResult.rows.map(r => [r.id, r.name]));

  for (const ccUserId of filteredCcUserIds) {
    await query(
      `INSERT INTO oa_approval_cc (instance_id, user_id, user_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (instance_id, user_id) DO NOTHING`,
      [instanceId, ccUserId, nameMap.get(ccUserId) || null]
    );
  }

  await notifyCc(
    {
      instanceId,
      instanceNo: freshInstance.instance_no,
      title: freshInstance.title,
      formTypeName: formType.name,
      applicantName: freshInstance.applicant_name,
      formSchema: formType.formSchema,
      formData,
    },
    filteredCcUserIds
  );
}

/** 审批通过后发送通知（流转到下一节点或最终通过） */
export async function sendApprovalNotifications(
  instanceId: number,
  approverUserId: number,
  approverUserName: string,
  callbackInstance: OaInstanceRow,
  formType: FormTypeDefinition,
  isLastNode: boolean
): Promise<void> {
  const data = await getInstanceNotifyData(instanceId);
  if (!data) return;

  if (isLastNode) {
    await notifyApproved(
      {
        instanceId,
        instanceNo: callbackInstance.instance_no,
        title: callbackInstance.title,
        formTypeName: data.formTypeName,
        applicantName: callbackInstance.applicant_name,
        formSchema: data.formType?.formSchema,
        formData: callbackInstance.form_data as Record<string, unknown>,
      },
      callbackInstance.applicant_id
    );
  } else {
    const nextNodeResult = await query<{
      assigned_user_id: number;
      node_name: string;
      node_order: number;
    }>(
      `SELECT assigned_user_id, node_name, node_order FROM oa_approval_nodes
       WHERE instance_id = $1 AND status = 'pending' AND node_type NOT IN ('auto')
       ORDER BY node_order LIMIT 1`,
      [instanceId]
    );

    if (nextNodeResult.rows.length > 0 && nextNodeResult.rows[0].assigned_user_id) {
      const latestInst = await query<OaInstanceRow>(
        `SELECT * FROM oa_approval_instances WHERE id = $1`,
        [instanceId]
      );
      const formData = latestInst.rows[0]?.form_data || callbackInstance.form_data;

      await notifyPendingApproval(
        {
          instanceId,
          instanceNo: callbackInstance.instance_no,
          title: callbackInstance.title,
          formTypeName: data.formTypeName,
          applicantName: callbackInstance.applicant_name,
          nodeName: nextNodeResult.rows[0].node_name,
          nodeOrder: nextNodeResult.rows[0].node_order,
          formSchema: data.formType?.formSchema,
          formData: formData as Record<string, unknown>,
        },
        [nextNodeResult.rows[0].assigned_user_id]
      );
    }
  }
}
