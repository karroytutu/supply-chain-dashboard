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
} from '../oa-utils';
import { evaluateAndTriggerNodes } from '../oa-workflow-utils';

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

  let autoNodeToExecute: OaNodeRow | null = null;

  const result = await transaction(async client => {
    // 插入审批实例（current_node_order = 0，由 evaluateAndTriggerNodes 创建节点后决定）
    const instanceResult = await client.query<OaInstanceRow>(
      `INSERT INTO oa_approval_instances
        (instance_no, form_type_id, title, form_data, status, applicant_id, applicant_name, applicant_dept, current_node_order)
       VALUES
        ($1, (SELECT id FROM oa_form_types WHERE code = $2), $3, $4, 'processing', $5, $6, $7, 0)
       RETURNING *`,
      [
        instanceNo,
        req.formTypeCode,
        req.title,
        JSON.stringify(req.formData),
        userId,
        userName,
        userDept,
      ]
    );

    const instance = instanceResult.rows[0];

    // 按需创建节点（条件评估 + 处理人解析）
    const newNodes = await evaluateAndTriggerNodes(
      client, instance.id, formType, req.formData, userId, 0
    );

    if (newNodes.length === 0) {
      throw new Error('审批流程配置错误：至少需要一个审批节点');
    }

    // 根据首个节点类型决定初始状态
    const firstNode = newNodes[0];
    const firstNodeIsAutoOrCc = firstNode.node_type === 'auto' || firstNode.node_type === 'cc';
    const initialStatus = firstNodeIsAutoOrCc ? 'processing' : 'pending';

    await client.query(
      `UPDATE oa_approval_instances SET status = $1, current_node_order = $2, updated_at = NOW() WHERE id = $3`,
      [initialStatus, firstNode.node_order, instance.id]
    );
    // 同步内存对象，供后续 sendSubmitNotifications 使用
    instance.status = initialStatus as any;
    instance.current_node_order = firstNode.node_order;

    // 记录操作日志（submit 不关联具体审批节点，node_order 为 NULL）
    await client.query(
      `INSERT INTO oa_approval_actions
        (instance_id, action_type, operator_id, operator_name)
       VALUES ($1, 'submit', $2, $3)`,
      [instance.id, userId, userName]
    );

    // 如果第一个节点是 auto 或 cc 类型，获取该节点行用于事务后回调
    if (firstNodeIsAutoOrCc) {
      autoNodeToExecute = firstNode;
    }

    return instance;
  });

  // 初始化 erp_meta
  const autoNode = autoNodeToExecute as OaNodeRow | null; // type assertion: assigned inside transaction callback
  if (req.formData.applicationNo) {
    await initErpMeta(result.id, req.formData.applicationNo as string).catch(err => {
      log.error(`erp_meta 初始化失败 [instanceId=${result.id}]:`, err);
    });
  } else {
    await initErpMeta(result.id, '').catch(err => {
      log.error(`erp_meta 初始化失败 [instanceId=${result.id}]:`, err);
    });
  }

  // 如果第一个节点是 auto 类型，确保 erp_meta 状态为 processing
  if (autoNode && autoNode.node_type === 'auto') {
    await query(
      `UPDATE oa_approval_instances SET erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"processing"') WHERE id = $1`,
      [result.id]
    );
  }

  // 异步操作（不阻塞提交响应）：写入任务表，由 worker 消费实现失败补偿
  const firstNodeIsAutoOrCc = autoNode !== null;
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

    if (firstNodeIsAutoOrCc && autoNode) {
      // auto/cc 节点回调：auto 节点内部会自行通知下一个审批人
      // cc 节点执行后也会自动流转到下一节点
      await enqueueExecuteAutoNode(result.id, autoNode.id).catch(err =>
        log.error(`submitApproval auto/cc节点任务入队失败:`, err)
      );
      // CC 节点首节点时，仍需发提交通知给后续人工审批人（CC 执行后会自动通知）
      if (autoNode.node_type === 'cc') {
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
    assigned_user_ids: number[] | null;
    node_name: string;
    node_order: number;
  }>(
    `SELECT assigned_user_ids, node_name, node_order FROM oa_approval_nodes
     WHERE instance_id = $1 AND status = 'pending' AND node_type IN ('approval', 'handle')
       AND node_order = (
         SELECT MIN(node_order) FROM oa_approval_nodes
         WHERE instance_id = $1 AND status = 'pending' AND node_type IN ('approval', 'handle')
       )`,
    [instance.id]
  );

  if (nodeResult.rows.length > 0) {
    const approverIds: number[] = [];
    for (const row of nodeResult.rows) {
      if (Array.isArray(row.assigned_user_ids)) {
        approverIds.push(...row.assigned_user_ids);
      }
    }
    if (approverIds.length > 0) {
      await enqueueSendApprovalNotification('pending', instance.id, {
        approverIds,
        nodeName: nodeResult.rows[0].node_name,
        nodeOrder: nodeResult.rows[0].node_order,
      });
    }
  }
}
