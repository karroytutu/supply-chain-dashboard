/**
 * OA审批 - 提交操作
 * @module services/oa-approval/mutations/submit-approval
 */

import { appQuery as query } from '../../../db/appPool';
import {
  FormTypeDefinition,
  SubmitApprovalRequest,
  OaApprovalInstanceRow,
  OaApprovalNodeRow,
} from '../oa-approval.types';
import {
  generateInstanceNo,
  validateFormData,
  filterNodesByCondition,
  resolveApproverId,
} from '../oa-approval-utils';
import { getFormTypeByCode } from '../form-types';
import { initErpMeta } from '../../fixed-asset/erp-meta-utils';
import { notifyPendingApproval } from '../oa-approval-notify';
import { transaction, getInstanceNotifyData } from './shared-utils';
import { executeAutoNodeCallback } from './approve-approval';

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

  // 1.5 beforeSubmit 钩子：业务校验和数据增强
  if (formType.beforeSubmit) {
    const extraData = await formType.beforeSubmit(req.formData, userId);
    req.formData = { ...req.formData, ...extraData };
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

  // 4. 数据库事务写入
  let autoNodeToExecute: OaApprovalNodeRow | null = null;
  const firstNodeIsAuto = filteredNodes[0].type === 'auto';
  const hasAutoNode = filteredNodes.some(n => n.type === 'auto');

  const result = await transaction(async (client) => {
    // 插入审批实例
    const initialStatus = firstNodeIsAuto ? 'processing' : 'pending';
    const initialNodeOrder = firstNodeIsAuto ? filteredNodes[0].order : 1;
    const instanceResult = await client.query<OaApprovalInstanceRow>(
      `INSERT INTO oa_approval_instances
        (instance_no, form_type_id, title, form_data, status, applicant_id, applicant_name, applicant_dept, current_node_order)
       VALUES
        ($1, (SELECT id FROM oa_form_types WHERE code = $2), $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        instanceNo,
        req.formTypeCode,
        req.title,
        JSON.stringify(req.formData),
        initialStatus,
        userId,
        userName,
        userDept,
        initialNodeOrder,
      ]
    );

    const instance = instanceResult.rows[0];

    // 插入审批节点
    for (const node of filteredNodes) {
      const approverId = await resolveApproverId(node, userId);

      let approverName: string | null = null;
      if (node.type === 'auto') {
        approverName = '系统';
      } else if (approverId) {
        const userResult = await client.query<{ name: string }>(
          `SELECT name FROM users WHERE id = $1`,
          [approverId]
        );
        approverName = userResult.rows[0]?.name || null;
      }

      await client.query(
        `INSERT INTO oa_approval_nodes
          (instance_id, node_order, node_name, node_type, role_code, assigned_user_id, assigned_user_name, input_schema, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
        [
          instance.id,
          node.order,
          node.name,
          node.type,
          node.roleCode || null,
          approverId,
          approverName,
          node.inputSchema ? JSON.stringify(node.inputSchema) : null,
        ]
      );
    }

    // 记录操作日志
    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name, node_order)
       VALUES ($1, 'submit', $2, $3, 1)`,
      [instance.id, userId, userName]
    );

    // 如果第一个节点是 auto 类型，获取 auto 节点行用于事务后回调
    if (firstNodeIsAuto) {
      const autoNodeResult = await client.query<OaApprovalNodeRow>(
        `SELECT * FROM oa_approval_nodes WHERE instance_id = $1 AND node_type = 'auto' AND status = 'pending' ORDER BY node_order LIMIT 1`,
        [instance.id]
      );
      if (autoNodeResult.rows.length > 0) {
        autoNodeToExecute = autoNodeResult.rows[0];
      }
    }

    return instance;
  });

  // 初始化 erp_meta
  if (req.formData.applicationNo) {
    await initErpMeta(result.id, req.formData.applicationNo as string).catch(err => {
      console.error(`[OA] erp_meta 初始化失败 [instanceId=${result.id}]:`, err);
    });
  } else if (hasAutoNode) {
    await initErpMeta(result.id, '').catch(err => {
      console.error(`[OA] erp_meta 初始化失败 [instanceId=${result.id}]:`, err);
    });
  }

  // 如果第一个节点是 auto 类型，确保 erp_meta 状态为 processing
  if (firstNodeIsAuto) {
    await query(
      `UPDATE oa_approval_instances SET erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"processing"') WHERE id = $1`,
      [result.id]
    );
  }

  // 如果第一个节点是 auto 类型，事务提交后异步执行 auto 节点回调
  if (firstNodeIsAuto && autoNodeToExecute && formType.onApproved) {
    const instance = result;
    const formData = req.formData as Record<string, unknown>;
    setImmediate(() => {
      executeAutoNodeCallback(instance.id, autoNodeToExecute!, formType!, instance, formData)
        .catch(err => console.error(`[OA] submitApproval auto节点异步执行错误:`, err));
    });
  }

  // 异步发送通知（不阻塞提交响应）
  setImmediate(() => {
    sendSubmitNotifications(result, formType, userId).catch(err => {
      console.error('[OA] 提交通知发送失败:', err);
    });
  });

  return {
    instanceId: result.id,
    instanceNo: result.instance_no,
  };
}

/** 提交审批后发送通知（仅通知首个审批人，抄送在节点通过后触发） */
async function sendSubmitNotifications(
  instance: OaApprovalInstanceRow,
  formType: FormTypeDefinition,
  applicantId: number
): Promise<void> {
  const data = await getInstanceNotifyData(instance.id);
  if (!data) return;

  const nodeResult = await query<{ assigned_user_id: number; node_name: string; node_order: number }>(
    `SELECT assigned_user_id, node_name, node_order FROM oa_approval_nodes
     WHERE instance_id = $1 AND status = 'pending' AND node_type NOT IN ('auto')
     ORDER BY node_order LIMIT 1`,
    [instance.id]
  );

  if (nodeResult.rows.length > 0 && nodeResult.rows[0].assigned_user_id) {
    const approverIds = [nodeResult.rows[0].assigned_user_id];
    await notifyPendingApproval(
      {
        instanceId: instance.id,
        instanceNo: instance.instance_no,
        title: instance.title,
        formTypeName: data.formTypeName,
        applicantName: instance.applicant_name,
        nodeName: nodeResult.rows[0].node_name,
        nodeOrder: nodeResult.rows[0].node_order,
        formSchema: data.formType?.formSchema,
        formData: instance.form_data as Record<string, unknown>,
      },
      approverIds
    );
  }
}
