/**
 * OA - 提交操作
 * @module services/oa/mutations/submit-approval
 */
import { createLogger } from '../../../utils/logger';
const log = createLogger('OA');

import { appQuery as query } from '../../../db/appPool';
import { FormTypeDefinition, SubmitApprovalRequest, OaInstanceRow, OaNodeRow } from '../oa.types';
import {
  generateInstanceNo,
  validateFormData,
  filterNodesByCondition,
  resolveHandlerRule,
} from '../oa-utils';

import { initErpMeta } from '../../fixed-asset/erp-meta-utils';
import {
  enqueueCreateProcessInstance,
  enqueueSendApprovalNotification,
  enqueueExecuteAutoNode,
} from '../oa-async-task.service';
import { transaction, getInstanceNotifyData } from './shared-utils';

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
  const filteredNodes = filterNodesByCondition(formType.workflowDef.nodes, req.formData);

  if (filteredNodes.length === 0) {
    throw new Error('审批流程配置错误：至少需要一个审批节点');
  }

  // 4. 数据库事务写入
  let autoNodeToExecute: OaNodeRow | null = null;
  const firstNodeIsAutoOrCc = ['auto', 'cc'].includes(filteredNodes[0].type);
  const hasAutoNode = filteredNodes.some(n => n.type === 'auto');

  const result = await transaction(async client => {
    // 插入审批实例
    const initialStatus = firstNodeIsAutoOrCc ? 'processing' : 'pending';
    const initialNodeOrder = filteredNodes[0].order;
    const instanceResult = await client.query<OaInstanceRow>(
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

    // 插入审批节点（支持多人展开）
    for (const node of filteredNodes) {
      // 计算 deadline_at（如果配置了 timeout）
      const deadlineAt = node.timeout
        ? new Date(Date.now() + node.timeout.durationMinutes * 60000)
        : null;
      const timeoutConfigJson = node.timeout
        ? JSON.stringify(node.timeout)
        : null;

      if (node.type === 'auto') {
        // 自动环节：无处理人
        await client.query(
          `INSERT INTO oa_approval_nodes
            (instance_id, node_order, node_name, node_type, role_code, assigned_user_id, assigned_user_name, input_schema, status, deadline_at, timeout_config, sign_mode)
           VALUES ($1, $2, $3, $4, NULL, NULL, '系统', NULL, 'pending', $5, $6, NULL)`,
          [instance.id, node.order, node.name, node.type, deadlineAt, timeoutConfigJson]
        );
        continue;
      }

      if (node.type === 'cc') {
        // 抄送环节：无处理人，系统自动执行
        await client.query(
          `INSERT INTO oa_approval_nodes
            (instance_id, node_order, node_name, node_type, role_code, assigned_user_id, assigned_user_name, input_schema, status, deadline_at, timeout_config, sign_mode)
           VALUES ($1, $2, $3, $4, NULL, NULL, '系统', NULL, 'pending', NULL, NULL, NULL)`,
          [instance.id, node.order, node.name, node.type]
        );
        continue;
      }

      // 解析处理人规则
      const { userIds, signMode } = await resolveHandlerRule(node, userId);

      if (userIds.length <= 1) {
        // 单人或无人：sign_mode = NULL（向后兼容）
        const uid = userIds[0] ?? null;
        let approverName: string | null = null;
        if (uid) {
          const userResult = await client.query<{ name: string }>(
            `SELECT name FROM users WHERE id = $1`, [uid]
          );
          approverName = userResult.rows[0]?.name || null;
        }
        await client.query(
          `INSERT INTO oa_approval_nodes
            (instance_id, node_order, node_name, node_type, role_code, assigned_user_id, assigned_user_name, input_schema, status, deadline_at, timeout_config, sign_mode)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, NULL)`,
          [
            instance.id, node.order, node.name, node.type,
            node.handler?.roleCode || null, uid, approverName,
            null,  // inputSchema 已废弃，始终为 NULL
            deadlineAt, timeoutConfigJson,
          ]
        );
      } else {
        // 多人展开：同 node_order，多条记录，共享 sign_mode
        for (const uid of userIds) {
          const userResult = await client.query<{ name: string }>(
            `SELECT name FROM users WHERE id = $1`, [uid]
          );
          const approverName = userResult.rows[0]?.name || null;
          await client.query(
            `INSERT INTO oa_approval_nodes
              (instance_id, node_order, node_name, node_type, role_code, assigned_user_id, assigned_user_name, input_schema, status, deadline_at, timeout_config, sign_mode)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11)`,
            [
              instance.id, node.order, node.name, node.type,
              node.handler?.roleCode || null, uid, approverName,
              null,  // inputSchema 已废弃，始终为 NULL
              deadlineAt, timeoutConfigJson, signMode,
            ]
          );
        }
      }
    }

    // 记录操作日志（submit 不关联具体审批节点，node_order 为 NULL）
    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name)
       VALUES ($1, 'submit', $2, $3)`,
      [instance.id, userId, userName]
    );

    // 如果第一个节点是 auto 或 cc 类型，获取该节点行用于事务后回调
    if (firstNodeIsAutoOrCc) {
      const autoNodeResult = await client.query<OaNodeRow>(
        `SELECT * FROM oa_approval_nodes WHERE instance_id = $1 AND node_type IN ('auto', 'cc') AND status = 'pending' ORDER BY node_order LIMIT 1`,
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
      log.error(`erp_meta 初始化失败 [instanceId=${result.id}]:`, err);
    });
  } else if (hasAutoNode) {
    await initErpMeta(result.id, '').catch(err => {
      log.error(`erp_meta 初始化失败 [instanceId=${result.id}]:`, err);
    });
  }

  // 如果第一个节点是 auto 类型，确保 erp_meta 状态为 processing
  if (firstNodeIsAutoOrCc && filteredNodes[0].type === 'auto') {
    await query(
      `UPDATE oa_approval_instances SET erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"processing"') WHERE id = $1`,
      [result.id]
    );
  }

  // 异步操作（不阻塞提交响应）：写入任务表，由 worker 消费实现失败补偿
  setImmediate(async () => {
    await enqueueCreateProcessInstance(
      result.id,
      req.formTypeCode,
      formType.name,
      userId,
      req.title,
      formType.formSchema,
      req.formData as Record<string, unknown>
    ).catch(err => log.error('创建壳实例任务入队失败:', err));

    if (firstNodeIsAutoOrCc && autoNodeToExecute) {
      // auto/cc 节点回调：auto 节点内部会自行通知下一个审批人
      // cc 节点执行后也会自动流转到下一节点
      await enqueueExecuteAutoNode(result.id, autoNodeToExecute.id).catch(err =>
        log.error(`submitApproval auto/cc节点任务入队失败:`, err)
      );
      // CC 节点首节点时，仍需发提交通知给后续人工审批人（CC 执行后会自动通知）
      if (filteredNodes[0].type === 'cc') {
        sendSubmitNotifications(result, formType).catch(err => {
          log.error('提交通知任务入队失败:', err);
        });
      }
    } else {
      sendSubmitNotifications(result, formType).catch(err => {
        log.error('提交通知任务入队失败:', err);
      });
    }
  });

  return {
    instanceId: result.id,
    instanceNo: result.instance_no,
  };
}

/** 提交审批后发送通知（仅通知首个审批人，抄送在节点通过后触发） */
async function sendSubmitNotifications(
  instance: OaInstanceRow,
  formType: FormTypeDefinition
): Promise<void> {
  const data = await getInstanceNotifyData(instance.id);
  if (!data) return;

  const nodeResult = await query<{
    assigned_user_id: number;
    node_name: string;
    node_order: number;
  }>(
    `SELECT assigned_user_id, node_name, node_order FROM oa_approval_nodes
     WHERE instance_id = $1 AND status = 'pending' AND node_type IN ('approval', 'handle')
       AND node_order = (
         SELECT MIN(node_order) FROM oa_approval_nodes
         WHERE instance_id = $1 AND status = 'pending' AND node_type IN ('approval', 'handle')
       )`,
    [instance.id]
  );

  if (nodeResult.rows.length > 0) {
    const approverIds = nodeResult.rows
      .filter(r => r.assigned_user_id)
      .map(r => r.assigned_user_id);
    if (approverIds.length > 0) {
      await enqueueSendApprovalNotification('pending', instance.id, {
        approverIds,
        nodeName: nodeResult.rows[0].node_name,
        nodeOrder: nodeResult.rows[0].node_order,
      });
    }
  }
}
