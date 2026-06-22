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
 * 通用自动节点异步执行器（含 auto 和 cc 节点）
 * auto 节点执行契约：
 * 1. 标记 auto 节点为 processing
 * 2. 执行 formType.onApproved()
 * 3. 成功：auto 节点 → approved，实例 → approved
 * 4. 失败：安全网 markErpFailed()，auto 节点 → failed，实例 → erp_failed
 *
 * cc 节点执行契约：
 * 1. 标记 cc 节点为 processing
 * 2. 解析角色 → 写入抄送记录 → 发送通知
 * 3. cc 节点 → approved（通知失败不阻断流程）
 * 4. 流转到下一节点
 */
export async function executeAutoNodeCallback(
  instanceId: number,
  autoNode: OaNodeRow,
  formType: FormTypeDefinition,
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  // CC 节点走专用执行路径
  if (autoNode.node_type === 'cc') {
    await executeCcNode(instanceId, autoNode, formType, instance);
    return;
  }

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

    const callbackResult = await formType.onApproved!(instance, formData);

    // 回调已处理退回（如核销校验退回营销师续催），跳过后续 mark-approved + advanceToNextNode
    if (callbackResult?.sendBack) {
      log.info(`auto 节点回调已执行退回 [instanceId=${instanceId} nodeId=${autoNode.id}]，跳过后续流转`);
      return;
    }

    // 成功：auto 节点 → approved
    await query(`UPDATE oa_approval_nodes SET status = 'approved' WHERE id = $1`, [autoNode.id]);

    // 检查是否有下一个待审批节点（全局搜索所有 pending 节点，不限于 auto 节点之后的位置）
    // 注意：不排除 auto 类型，因为现有代码在第 61 行有递归处理连续 auto 节点的逻辑
    // DISTINCT ON + round DESC：退回后同一 node_order 可能有多轮记录，取最新轮次
    const nextNodeResult = await query<OaNodeRow>(
      `SELECT DISTINCT ON (node_order) * FROM oa_approval_nodes
       WHERE instance_id = $1 AND status = 'pending'
       ORDER BY node_order, round DESC
       LIMIT 1`,
      [instanceId]
    );

    if (nextNodeResult.rows.length > 0) {
      const nextNode = nextNodeResult.rows[0];
      if (nextNode.node_type === 'auto' || nextNode.node_type === 'cc') {
        await query(
          `UPDATE oa_approval_instances
           SET current_node_order = $1, updated_at = NOW()
           WHERE id = $2`,
          [nextNode.node_order, instanceId]
        );

        // 兜底：入队异步任务
        const { enqueueExecuteAutoNode } = await import('../oa-async-task.service');
        enqueueExecuteAutoNode(instanceId, nextNode.id).catch(err =>
          log.error(`连续auto节点入队失败 [instanceId=${instanceId}]:`, err)
        );

        // 立即执行：复用当前上下文，claim 幂等保护
        setImmediate(() => {
          executeAutoNodeCallback(instanceId, nextNode, formType, instance, formData)
            .catch(err => log.error(`连续auto/cc节点立即执行失败 [instanceId=${instanceId}]:`, err));
        });
      } else {
        await query(
          `UPDATE oa_approval_instances
           SET current_node_order = $1, status = 'pending', updated_at = NOW(),
               erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"completed"')
           WHERE id = $2`,
          [nextNode.node_order, instanceId]
        );
        const approverIds = Array.isArray(nextNode.assigned_user_ids) ? nextNode.assigned_user_ids : [];
        if (approverIds.length > 0) {
          // 流转通知入队异步任务，支持失败重试
          const { enqueueSendApprovalNotification } = await import('../oa-async-task.service');
          enqueueSendApprovalNotification('pending', instanceId, {
            approverIds,
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

    // 直接查找需要重试的 auto/cc 节点（不再依赖 current_node_order，防止节点位置偏移导致找不到或找错节点）
    const nodeResult = await client.query<OaNodeRow>(
      `SELECT * FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_type IN ('auto', 'cc') AND status IN ('pending', 'failed')
       ORDER BY node_order, round DESC LIMIT 1`,
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
 * CC 节点专用执行器
 * 执行动作：解析角色 → 写入抄送记录 → 发送通知 → 标记 approved → 流转下一节点
 * 通知发送失败不阻断流程，节点仍标记 approved
 */
async function executeCcNode(
  instanceId: number,
  ccNode: OaNodeRow,
  formType: FormTypeDefinition,
  instance: OaInstanceRow
): Promise<void> {
  try {
    // 幂等保护
    const claimResult = await query(
      `UPDATE oa_approval_nodes SET status = 'processing', acted_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'failed')`,
      [ccNode.id]
    );
    if (claimResult.rowCount === 0) {
      log.warn(`CC节点已被其他进程处理，跳过 [nodeId=${ccNode.id}]`);
      return;
    }

    // 解析 CC 角色：从 workflowDef.nodes 中找对应节点的 ccRoles
    const ccNodeDef = formType.workflowDef.nodes.find(n => n.order === ccNode.node_order);
    const ccRoles = ccNodeDef?.ccRoles;
    if (!ccRoles || ccRoles.length === 0) {
      log.warn(`CC节点无角色配置，直接通过 [nodeId=${ccNode.id}, order=${ccNode.node_order}]`);
      await query(`UPDATE oa_approval_nodes SET status = 'approved' WHERE id = $1`, [ccNode.id]);
      await advanceToNextNode(instanceId, ccNode, formType, instance);
      return;
    }

    // 查找用户 + 过滤申请人
    const ccUserIds = await findUserIdsByRoleCodes(ccRoles);
    const filteredCcUserIds = ccUserIds.filter(id => id !== instance.applicant_id);

    if (filteredCcUserIds.length > 0) {
      // 批量查用户名
      const usersResult = await query<{ id: number; name: string }>(
        `SELECT id, name FROM users WHERE id = ANY($1)`,
        [filteredCcUserIds]
      );
      const nameMap = new Map(usersResult.rows.map(r => [r.id, r.name]));

      // 写入 oa_approval_cc（幂等，带 source_node_order 关联）
      for (const ccUserId of filteredCcUserIds) {
        await query(
          `INSERT INTO oa_approval_cc (instance_id, user_id, user_name, source_node_order)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (instance_id, user_id) DO NOTHING`,
          [instanceId, ccUserId, nameMap.get(ccUserId) || null, ccNode.node_order]
        );
      }

      // 发送抄送通知（失败不阻断）
      try {
        await notifyCc(
          {
            instanceId,
            instanceNo: instance.instance_no,
            title: instance.title,
            formTypeName: formType.name,
            applicantName: instance.applicant_name,
            formSchema: formType.formSchema,
            formData: (instance.form_data || {}) as Record<string, unknown>,
          },
          filteredCcUserIds
        );
      } catch (notifyErr) {
        log.error(`CC节点通知发送失败（不阻断流程） [nodeId=${ccNode.id}]:`, notifyErr);
      }
    }

    // 标记 CC 节点为 approved
    await query(`UPDATE oa_approval_nodes SET status = 'approved', acted_at = NOW() WHERE id = $1`, [ccNode.id]);

    // 流转到下一节点
    await advanceToNextNode(instanceId, ccNode, formType, instance);
  } catch (error) {
    log.error(`CC节点执行失败 [instanceId=${instanceId}, nodeId=${ccNode.id}]:`, error);
    // CC 节点失败不阻断流程，标记为 approved 并尝试继续流转
    try {
      await query(`UPDATE oa_approval_nodes SET status = 'approved', acted_at = NOW() WHERE id = $1`, [ccNode.id]);
    } catch (updateErr) {
      log.error(`CC节点标记approved失败 [nodeId=${ccNode.id}]:`, updateErr);
    }
    try {
      await advanceToNextNode(instanceId, ccNode, formType, instance);
    } catch (advanceErr) {
      log.error(`CC节点降级流转失败 [nodeId=${ccNode.id}]，依赖异步任务兆底:`, advanceErr);
    }
  }
}

/**
 * 自动节点（auto/cc）完成后流转到下一节点
 * 提取自 executeAutoNodeCallback 的后半段逻辑，供 auto 和 cc 节点共用
 */
async function advanceToNextNode(
  instanceId: number,
  currentNode: OaNodeRow,
  formType: FormTypeDefinition,
  instance: OaInstanceRow
): Promise<void> {
  const formData = (instance.form_data || {}) as Record<string, unknown>;

  // DISTINCT ON + round DESC：退回后同一 node_order 可能有多轮记录，取最新轮次
  const nextNodeResult = await query<OaNodeRow>(
    `SELECT DISTINCT ON (node_order) * FROM oa_approval_nodes
     WHERE instance_id = $1 AND status = 'pending'
     ORDER BY node_order, round DESC
     LIMIT 1`,
    [instanceId]
  );

  if (nextNodeResult.rows.length > 0) {
    const nextNode = nextNodeResult.rows[0];
    if (nextNode.node_type === 'auto' || nextNode.node_type === 'cc') {
      await query(
        `UPDATE oa_approval_instances
         SET current_node_order = $1, updated_at = NOW()
         WHERE id = $2`,
        [nextNode.node_order, instanceId]
      );

      const { enqueueExecuteAutoNode } = await import('../oa-async-task.service');
      enqueueExecuteAutoNode(instanceId, nextNode.id).catch(err =>
        log.error(`连续auto/cc节点入队失败 [instanceId=${instanceId}]:`, err)
      );

      setImmediate(() => {
        executeAutoNodeCallback(instanceId, nextNode, formType, instance, formData)
          .catch(err => log.error(`连续auto/cc节点立即执行失败 [instanceId=${instanceId}]:`, err));
      });
    } else {
      await query(
        `UPDATE oa_approval_instances
         SET current_node_order = $1, status = 'pending', updated_at = NOW(),
             erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"completed"')
         WHERE id = $2`,
        [nextNode.node_order, instanceId]
      );
      const approverIds = Array.isArray(nextNode.assigned_user_ids) ? nextNode.assigned_user_ids : [];
      if (approverIds.length > 0) {
        const { enqueueSendApprovalNotification } = await import('../oa-async-task.service');
        enqueueSendApprovalNotification('pending', instanceId, {
          approverIds,
          nodeName: nextNode.node_name,
          nodeOrder: nextNode.node_order,
        }).catch(err => log.error('自动节点流转通知入队失败:', err));
      }
    }
  } else {
    // 无后续节点，完成审批
    await query(
      `UPDATE oa_approval_instances
       SET status = 'approved', completed_at = NOW(), updated_at = NOW(),
           erp_meta = jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"completed"')
       WHERE id = $1`,
      [instanceId]
    );
    const { enqueueFinalizeProcessInstance, enqueueSendApprovalNotification } = await import('../oa-async-task.service');
    enqueueFinalizeProcessInstance(instanceId, 'agree').catch(err => {
      log.error('自动节点末位完成壳实例入队失败:', err);
    });
    enqueueSendApprovalNotification('approved', instanceId, {}).catch(err =>
      log.error('自动节点审批通过通知入队失败:', err)
    );
  }
}
