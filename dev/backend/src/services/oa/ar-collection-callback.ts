/**
 * 逾期催收 - OA表单回调实现
 * @module services/oa/ar-collection-callback
 *
 * 催收流程的流转由引擎条件重评估机制驱动（approve-approval.ts），
 * 本文件保留业务逻辑回调：
 * - beforeSubmit: 催收单创建时的数据初始化
 * - verifyBills: ERP核销校验（供 auto 节点回调使用）
 * - handleArCollectionAutoVerify: auto 节点回调（核销校验 + 即时退回循环催收）
 */

import { appQuery as query, getAppClient } from '../../db/appPool';
import { OaInstanceRow, OaNodeRow } from './oa.types';
import type { FormAccessor } from './form-accessor';
import { checkExistingBillIds } from '../erp-client/erp-debt.service';
import { enqueueSendApprovalNotification } from './oa-async-task.service';
import { findUserIdsByRoleCodes } from './oa-workflow-utils';
import { OA_ROLE } from './oa-role-codes';
import { sendBackToNode } from './mutations/shared-utils';
import { cache } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import log from '../../utils/logger';

const MODULE = 'ar-collection-callback';

// =====================================================
// beforeSubmit: 催收单创建时的数据初始化
// =====================================================

/**
 * 提交前校验：催落实例由定时任务创建，beforeSubmit 主要用于补充/校验数据
 */
export async function beforeSubmitArCollection(
  formData: Record<string, unknown>,
  _userId: number
): Promise<Record<string, unknown>> {
  // 催收单创建时无需额外初始化数据（只读展示字段由 ar-collection-creator.ts 填充）
  return {};
}

// =====================================================
// ERP 核销校验：检查账单是否已在 ERP 中核销消失
// =====================================================

/**
 * 核销校验：检查 ERP 中账单是否已核销消失，同步更新 verifyStatus 字段
 *
 * @returns 核销结果：全部核销 / 部分核销 / 无核销
 */
export async function verifyBills(
  instance: OaInstanceRow,
  form: FormAccessor
): Promise<'all_verified' | 'partial_verified' | 'not_verified'> {
  const billDetails = form.getTableRecords('billDetails');
  const billIds = billDetails.map(b => b.billNo as string).filter(Boolean);

  if (billIds.length === 0) {
    log.warn(`[${MODULE}] 核销校验: 无账单明细`);
    return 'not_verified';
  }

  const existingIds = await checkExistingBillIds(billIds);
  const disappearedIds = billIds.filter(id => !existingIds.has(id));

  // 同步更新 billDetails 中的 verifyStatus 字段
  if (disappearedIds.length > 0) {
    const disappearedSet = new Set(disappearedIds);
    for (const bill of billDetails) {
      if (disappearedSet.has(bill.billNo as string)) {
        bill.verifyStatus = '已核销';
      }
    }

    // 仅在有核销变化时才写入 DB，避免无意义的写入产生并发冲突
    await query(
      `UPDATE oa_approval_instances SET form_data = jsonb_set(form_data, '{billDetails}', $1), updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(billDetails), instance.id]
    );

    // 核销后主动清除欠款缓存，确保催收人员下次查询拿到最新数据
    cache.invalidate(CACHE_KEY.ERP_DEBTS_ALL);
  }

  if (disappearedIds.length === billIds.length) {
    log.info(`[${MODULE}] 核销校验: 全部${billIds.length}笔已核销，流程结束`);
    return 'all_verified';
  } else if (disappearedIds.length > 0) {
    const remaining = billIds.length - disappearedIds.length;
    log.info(`[${MODULE}] 核销校验: ${disappearedIds.length}/${billIds.length}笔已核销，剩余${remaining}笔继续催收`);
    return 'partial_verified';
  }

  log.info(`[${MODULE}] 核销校验: 暂无已核销账单，需继续催收`);
  return 'not_verified';
}

// =====================================================
// auto 节点回调：核销校验 + 即时退回循环催收
// =====================================================

/**
 * 催收流程 auto 环节（核销校验）的回调
 *
 * 职责：检查客户还款情况，决定催收单走向
 * - 全部还款：无需额外操作，框架自动结案
 * - 部分/未还款：即时退回营销师继续催收
 *
 * 设计原则：轻量回调（~30行），只负责核销校验 + 循环退回。
 * 所有流转路由已由通用条件重评估机制处理。
 */
export async function handleArCollectionAutoVerify(
  instance: OaInstanceRow,
  form: FormAccessor
): Promise<void | { sendBack: boolean }> {
  const result = await verifyBills(instance, form);

  if (result === 'all_verified') {
    // 全部还款：无需操作，框架自动将 node 7 → approved、催收单 → approved
    log.info(`[${MODULE}] auto 回调: 全部核销，催收单将自动结案`);
    return;
  }

  // 部分/未还款：退回营销师继续催收（复用通用退回函数）
  const client = await getAppClient();
  try {
    await client.query('BEGIN');

    // 查找 auto 节点（核销校验）的最新行，用作退回的“当前环节”
    const autoNodeResult = await client.query<OaNodeRow>(
      `SELECT * FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_type = 'auto'
       ORDER BY node_order DESC, round DESC LIMIT 1`,
      [instance.id]
    );
    if (autoNodeResult.rows.length === 0) {
      log.warn(`[${MODULE}] auto 回调: 未找到 auto 节点，跳过退回`);
      await client.query('ROLLBACK');
      return;
    }
    const autoNode = autoNodeResult.rows[0];

    // 构建评论文本
    const billDetails = form.getTableRecords('billDetails');
    const totalBills = billDetails.filter(b => b.billNo).length;
    const verifiedBills = billDetails.filter(b => b.verifyStatus === '已核销').length;
    const remaining = totalBills - verifiedBills;
    const commentText = result === 'partial_verified'
      ? `核销校验：${verifiedBills}/${totalBills}笔已还款，剩余${remaining}笔继续催收`
      : `核销校验：暂无已核销账单，共${totalBills}笔需继续催收`;

    // 通用退回：auto 环节 → send_back，营销师(1) → pending，中间环节 → pending，指针 → 1
    await sendBackToNode(
      client, instance.id,
      autoNode.id, autoNode.node_order,
      1, // 退回到营销师催收（node_order = 1）
      commentText
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    log.error(`[${MODULE}] auto 回调: 退回营销师操作失败`, err);
    throw err;
  } finally {
    client.release();
  }

  // 发送通知给营销师（事务外，失败不阻断）
  try {
    const nodeResult = await query<{ assigned_user_ids: number[] | null }>(
      `SELECT assigned_user_ids FROM oa_approval_nodes
       WHERE instance_id = $1 AND node_order = 1
       ORDER BY round DESC LIMIT 1`,
      [instance.id]
    );
    let approverIds: number[] = [];
    const assignedIds = nodeResult.rows[0]?.assigned_user_ids;
    if (Array.isArray(assignedIds) && assignedIds.length > 0) {
      approverIds = assignedIds;
    } else {
      approverIds = await findUserIdsByRoleCodes([OA_ROLE.MARKETER]);
    }
    if (approverIds.length > 0) {
      await enqueueSendApprovalNotification('pending', instance.id, {
        approverIds,
        nodeName: '营销师催收',
        nodeOrder: 1,
      });
    }
  } catch (notifyErr) {
    log.error(`[${MODULE}] auto 回调: 发送通知失败（不阻断流程）`, notifyErr);
  }

  log.info(`[${MODULE}] auto 回调: ${result}，已退回营销师继续催收`);
  return { sendBack: true };
}
