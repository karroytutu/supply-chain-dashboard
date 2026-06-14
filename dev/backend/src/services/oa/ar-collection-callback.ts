/**
 * 逾期催收 - OA表单回调实现
 * @module services/oa/ar-collection-callback
 *
 * 处理催收表单的提交前校验和各操作的流转逻辑：
 * - beforeSubmit: 从ERP查询催收数据，填充只读展示字段
 * - onApproved: 根据action字段执行对应操作（核销/延期/差异/升级/发函/起诉）
 */

import { appQuery as query, getAppClient } from '../../db/appPool';
import { PoolClient } from 'pg';
import { OaInstanceRow, OaNodeRow } from './oa.types';
import { insertNodeAfter, transaction } from './mutations/shared-utils';
import { checkExistingBillIds } from '../erp-client/erp-debt.service';
import {
  AR_EXTENSION_MAX_DAYS,
  ROLE_CODES,
} from '../../utils/constants';
import {
  COLLECTION_ACTIONS,
  ESCALATION_ROLES,
} from './form-types/ar-collection';
import log from '../../utils/logger';

const MODULE = 'ar-collection-callback';

// =====================================================
// beforeSubmit: 填充只读展示字段
// =====================================================

/**
 * 提交前校验：从 formData 中读取已有数据或从 ERP 查询
 * 催落实例由定时任务创建，beforeSubmit 主要用于补充/校验数据
 */
export async function beforeSubmitArCollection(
  formData: Record<string, unknown>,
  userId: number
): Promise<Record<string, unknown>> {
  // 确保延期次数有默认值
  if (formData._extensionCount === undefined) {
    return { _extensionCount: 0 };
  }
  return {};
}

// =====================================================
// onApproved: 自动节点执行时的业务逻辑
// =====================================================

/**
 * 自动节点执行时调用：根据 formData.action 决定流转逻辑
 * 在 approve-approval.ts 的 executeAutoNodeCallback 中被调用
 */
export async function onApprovedArCollection(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const action = formData.action as string;
  const currentLevel = (formData._currentLevel as number) || 0;

  log.info(`[${MODULE}] 执行催收操作: instanceId=${instance.id}, action=${action}, level=${currentLevel}`);

  switch (action) {
    case COLLECTION_ACTIONS.VERIFY:
      await handleVerify(instance, formData);
      break;
    case COLLECTION_ACTIONS.EXTENSION:
      await handleExtension(instance, formData, currentLevel);
      break;
    case COLLECTION_ACTIONS.DIFFERENCE:
      await handleDifference(instance, currentLevel);
      break;
    case COLLECTION_ACTIONS.ESCALATE:
      await handleEscalate(instance, formData, currentLevel);
      break;
    case COLLECTION_ACTIONS.RESOLVE_DIFF:
      await handleResolveDiff(instance);
      break;
    case COLLECTION_ACTIONS.SEND_LETTER:
      // 发函：记录信息，当前节点完成，催收继续留在L2
      log.info(`[${MODULE}] 发函完成: instanceId=${instance.id}`);
      await insertResultComment(instance.id, '发函完成');
      break;
    case COLLECTION_ACTIONS.LAWSUIT:
      await handleLawsuit(instance);
      break;
    default:
      log.warn(`[${MODULE}] 未知催收操作: ${action}`);
  }
}

// =====================================================
// 处理结果评论：向自动环节写入系统处理说明
// =====================================================

/**
 * 向自动环节插入一条系统处理结果评论
 * 使用统一评论模型（oa_approval_actions action_type='comment'）
 * 评论插入失败不影响主流程
 */
async function insertResultComment(
  instanceId: number,
  comment: string
): Promise<void> {
  try {
    const autoNodeResult = await query<{ node_order: number }>(
      `SELECT node_order FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_type = 'auto' AND status = 'processing'
       ORDER BY node_order LIMIT 1`,
      [instanceId]
    );
    if (autoNodeResult.rows.length > 0) {
      await query(
        `INSERT INTO oa_approval_actions
          (instance_id, action_type, operator_name, node_order, comment)
         VALUES ($1, 'comment', '系统', $2, $3)`,
        [instanceId, autoNodeResult.rows[0].node_order, comment]
      );
    }
  } catch (err) {
    log.error(`[${MODULE}] 插入处理结果评论失败:`, err);
    // 评论插入失败不应影响主流程
  }
}

// =====================================================
// 各操作处理函数
// =====================================================

/**
 * 核销标记：检查ERP中账单是否已核销消失
 */
async function handleVerify(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const billDetails = (formData.billDetails as Array<Record<string, unknown>>) || [];
  const billIds = billDetails.map(b => b.billNo as string).filter(Boolean);

  if (billIds.length === 0) {
    log.warn(`[${MODULE}] 核销标记: 无账单明细`);
    await insertResultComment(instance.id, '核销验证：无账单明细，跳过检查');
    return;
  }

  const existingIds = await checkExistingBillIds(billIds);
  const disappearedIds = billIds.filter(id => !existingIds.has(id));

  if (disappearedIds.length === billIds.length) {
    // 全部消失：实例完成（由 auto 节点后续处理）
    log.info(`[${MODULE}] 核销标记: 全部${billIds.length}笔已核销，流程结束`);
    await insertResultComment(
      instance.id,
      `核销验证：${billIds.length}/${billIds.length}笔账单已全部核销，催收流程结束`
    );
  } else if (disappearedIds.length > 0) {
    // 部分消失：插入新同级节点继续操作
    const remaining = billIds.length - disappearedIds.length;
    log.info(`[${MODULE}] 核销标记: ${disappearedIds.length}/${billIds.length}笔已核销，插入新节点继续`);
    await insertResultComment(
      instance.id,
      `核销验证：${disappearedIds.length}/${billIds.length}笔已核销，剩余${remaining}笔继续催收`
    );
    await insertCollectionNode(instance.id, '继续催收', 'marketer', 0);
  } else {
    log.info(`[${MODULE}] 核销标记: 暂无已核销账单`);
    await insertResultComment(instance.id, '核销验证：暂无已核销账单，需继续催收');
  }
}

/**
 * 申请延期：根据次数和层级走不同流程
 */
async function handleExtension(
  instance: OaInstanceRow,
  formData: Record<string, unknown>,
  currentLevel: number
): Promise<void> {
  const extensionCount = (formData._extensionCount as number) || 0;
  const extensionDays = formData.extensionDays as number;

  if (extensionDays < 1 || extensionDays > AR_EXTENSION_MAX_DAYS) {
    throw new Error(`延期天数必须在1-${AR_EXTENSION_MAX_DAYS}天之间`);
  }

  if (currentLevel === 0 && extensionCount === 0) {
    // L0首次延期：直接生效
    log.info(`[${MODULE}] L0首次延期${extensionDays}天，直接生效`);
    await insertResultComment(instance.id, `延期${extensionDays}天已生效`);
  } else if (currentLevel === 0 && extensionCount >= 1) {
    // L0二次+延期：需要担保签字（signature字段已在表单中，这里验证）
    if (!formData.guarantorSignature) {
      throw new Error('二次延期需要营销担保签字');
    }
    log.info(`[${MODULE}] L0第${extensionCount + 1}次延期${extensionDays}天，担保签字已验证`);
    await insertResultComment(instance.id, `延期${extensionDays}天，担保签字已验证`);
  } else if (currentLevel === 1) {
    // L1延期：插入总经理审批节点
    log.info(`[${MODULE}] L1延期${extensionDays}天，插入总经理审批节点`);
    await insertResultComment(instance.id, `延期${extensionDays}天，已提交总经理审批`);
    await insertCollectionNode(
      instance.id,
      '总经理审批延期',
      ROLE_CODES.ADMIN,
      1, // approval type for GM
    );
  } else {
    // L2+延期：同 L1，插入总经理审批节点
    log.info(`[${MODULE}] L${currentLevel}延期${extensionDays}天，插入总经理审批节点`);
    await insertResultComment(instance.id, `延期${extensionDays}天，已提交总经理审批`);
    await insertCollectionNode(
      instance.id,
      '总经理审批延期',
      ROLE_CODES.ADMIN,
      currentLevel,
    );
  }
}

/**
 * 存在差异：插入财务差异处理节点
 */
async function handleDifference(
  instance: OaInstanceRow,
  currentLevel: number
): Promise<void> {
  log.info(`[${MODULE}] 标记差异，插入财务差异处理节点`);
  await insertResultComment(instance.id, '已标记差异，等待财务核实');
  await insertCollectionNode(
    instance.id,
    '财务差异处理',
    ROLE_CODES.CURRENT_ACCOUNTANT,
    currentLevel,
  );
}

/**
 * 升级处理：插入下一级催收节点
 */
async function handleEscalate(
  instance: OaInstanceRow,
  formData: Record<string, unknown>,
  currentLevel: number
): Promise<void> {
  const nextLevel = currentLevel + 1;
  const targetRole = ESCALATION_ROLES[nextLevel];
  if (!targetRole) {
    throw new Error('已达到最高升级级别，无法继续升级');
  }

  const levelNames: Record<number, string> = { 1: '营销经理', 2: '财务' };
  const nodeName = `${levelNames[nextLevel] || '上级'}催收`;

  log.info(`[${MODULE}] 升级到L${nextLevel}(${targetRole})，插入新节点`);
  await insertResultComment(instance.id, `已升级到L${nextLevel}(${levelNames[nextLevel] || '上级'})催收`);
  await insertCollectionNode(instance.id, nodeName, targetRole, nextLevel);
}

/**
 * 差异解决：插入营销师节点继续催收
 */
async function handleResolveDiff(instance: OaInstanceRow): Promise<void> {
  log.info(`[${MODULE}] 差异解决，插入营销师催收节点`);
  await insertResultComment(instance.id, '差异已解决，已安排营销师继续催收');
  await insertCollectionNode(instance.id, '营销师催收', ROLE_CODES.MARKETER, 0);
}

/**
 * 起诉：插入起诉立案节点，进入多环节流程
 */
async function handleLawsuit(instance: OaInstanceRow): Promise<void> {
  log.info(`[${MODULE}] 起诉，插入起诉立案节点`);
  await insertResultComment(instance.id, '已进入起诉立案程序');
  await insertCollectionNode(
    instance.id,
    '起诉立案',
    ROLE_CODES.CURRENT_ACCOUNTANT,
    2,
  );
}

// =====================================================
// 通用节点插入辅助函数
// =====================================================

/**
 * 插入催收节点（封装 insertNodeAfter）
 * 在事务内查询实际 auto 节点位置，确保新节点插在正确位置（auto 节点之前）
 * 根据 roleCode 自动解析处理人，确保新建环节有明确的负责人
 */
async function insertCollectionNode(
  instanceId: number,
  nodeName: string,
  roleCode: string,
  level: number,
): Promise<OaNodeRow> {
  return transaction(async (client: PoolClient) => {
    // 查询当前 pending/processing auto 节点的实际位置（避免依赖可能过时的 instance.current_node_order）
    const autoNodeResult = await client.query<{ node_order: number }>(
      `SELECT node_order FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_type = 'auto' AND status IN ('pending', 'processing')
       ORDER BY node_order LIMIT 1`,
      [instanceId]
    );
    // 无 auto 节点说明流程状态异常（insertCollectionNode 仅在 auto 节点回调中被调用），应抛出错误而非静默 fallback
    if (autoNodeResult.rows.length === 0) {
      throw new Error(`insertCollectionNode: 未找到 pending/processing 的 auto 节点 [instanceId=${instanceId}]`);
    }
    // 新节点插入到 auto 节点之前
    const actualAfterOrder = autoNodeResult.rows[0].node_order - 1;

    // 根据角色编码查找对应的处理人（使用事务 client 保证查询一致性）
    const roleResult = await client.query<{ user_id: number }>(
      `SELECT ur.user_id FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE r.code = $1 AND r.status = 1
       LIMIT 1`,
      [roleCode]
    );
    const approverId = roleResult.rows[0]?.user_id || null;
    let approverName: string | undefined;
    if (approverId) {
      const userResult = await client.query<{ name: string }>(
        'SELECT name FROM users WHERE id = $1',
        [approverId]
      );
      approverName = userResult.rows[0]?.name;
    }

    return insertNodeAfter(client, instanceId, actualAfterOrder, {
      name: nodeName,
      type: 'role',
      roleCode,
      assignedUserId: approverId ?? undefined,
      assignedUserName: approverName,
    });
  });
}
