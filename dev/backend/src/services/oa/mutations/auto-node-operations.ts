/**
 * OA - 自动节点操作（执行 + 重试）
 * @module services/oa/mutations/auto-node-operations
 */
import { createLogger } from '../../../utils/logger';
const log = createLogger('OA');

import { appQuery as query } from '../../../db/appPool';
import { FormTypeDefinition, OaInstanceRow, OaNodeRow, ApprovalStatus } from '../oa.types';
import { getFormTypeByCode } from '../form-types';
import { notifyCc } from '../oa-notify';
import { finalizeProcessInstance } from '../oa-process-centre';
import { findUserIdsByRoleCodes } from '../oa-utils';
import { transaction } from './shared-utils';

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

    // 最终防线：执行 ERP 回调前确认 auto 节点之前没有未完成的人工环节
    // 防止定时恢复任务误判导致自动环节在人工审批完成前被执行
    // 仅检查 node_order < autoNode.node_order 的节点，auto 节点之后的人工节点属于正常 pending
    const finalCheck = await query(
      `SELECT id, node_name, status FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_type IN ('approval', 'handle')
         AND node_order < $2
         AND status IN ('pending', 'processing') LIMIT 1`,
      [instanceId, autoNode.node_order]
    );
    if (finalCheck.rows.length > 0) {
      const blocker = finalCheck.rows[0];
      log.error(
        `[安全防线] auto 节点执行前发现未完成人工环节: ` +
        `instanceId=${instanceId}, blocker=${blocker.node_name}(${blocker.status})，中止执行`
      );
      // 回退 auto 节点为 pending，不执行 ERP 回调
      await query(
        `UPDATE oa_approval_nodes SET status = 'pending', acted_at = NULL WHERE id = $1`,
        [autoNode.id]
      );
      await query(
        `UPDATE oa_approval_instances SET status = 'pending', updated_at = NOW() WHERE id = $1`,
        [instanceId]
      );
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
        // 连续 auto 节点改为异步任务，避免递归过深并支持失败重试
        const { enqueueExecuteAutoNode } = await import('../oa-async-task.service');
        await enqueueExecuteAutoNode(instanceId, nextNode.id);
      } else {
        await query(
          `UPDATE oa_approval_instances
           SET current_node_order = $1, status = 'pending', updated_at = NOW(),
               erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"completed"')
           WHERE id = $2`,
          [nextNode.node_order, instanceId]
        );
        if (nextNode.assigned_user_id) {
          // 流转通知入队异步任务，支持失败重试
          const { enqueueSendApprovalNotification } = await import('../oa-async-task.service');
          enqueueSendApprovalNotification('pending', instanceId, {
            approverIds: [nextNode.assigned_user_id],
            nodeName: nextNode.node_name,
            nodeOrder: nextNode.node_order,
          }).catch(err => log.error('auto节点流转通知入队失败:', err));
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
      // 完成钉钉流程中心壳实例 + 审批通过通知（均入队异步任务，支持失败重试）
      const { enqueueFinalizeProcessInstance, enqueueSendApprovalNotification } = await import('../oa-async-task.service');
      enqueueFinalizeProcessInstance(instanceId, 'agree').catch(err => {
        log.error('auto节点末位完成壳实例入队失败:', err);
      });
      enqueueSendApprovalNotification('approved', instanceId, {}).catch(err =>
        log.error('auto节点审批通过通知入队失败:', err)
      );
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
    // 实例级分布式锁 + 行锁，防止多实例并发状态覆盖
    await client.query('SELECT pg_advisory_xact_lock($1)', [instanceId]);

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

    await client.query(
      `UPDATE oa_approval_instances
       SET status = 'processing',
           erp_meta = COALESCE(erp_meta, '{}') || '{"status":"processing","requestLog":null,"retries":0}'::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [instanceId]
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
