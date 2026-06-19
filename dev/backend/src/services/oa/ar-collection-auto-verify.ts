/**
 * 逾期催收 - 自动核销检查
 * @module services/oa/ar-collection-auto-verify
 *
 * 每日流水线执行时，批量检查 pending 催收实例中的单据是否已从 ERP 消失（客户已还款）。
 * 三种处理情况：
 *   A. 全部消失 → 标记所有 verifyStatus='已核销'，关闭实例
 *   B. 部分消失 → 标记已消失单据 verifyStatus='已核销'（不移除），插入新营销师节点续催
 *   C. 都没消失 → 跳过
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('ArCollectionAutoVerify');

import { appQuery as query, getAppClient } from '../../db/appPool';
import { fetchAllErpDebts } from '../erp-client/erp-debt.service';
import { insertCollectionNode } from './ar-collection-callback';
import {
  enqueueFinalizeProcessInstance,
  enqueueCompleteAllPendingTodos,
} from './oa-async-task.service';

// =====================================================
// 类型定义
// =====================================================

export interface AutoVerifyResult {
  checked: number;    // 检查的实例总数
  closed: number;     // 全部核销 → 关闭的实例数
  updated: number;    // 部分核销 → 标记状态续催的实例数
  unchanged: number;  // 无核销 → 跳过的实例数
}

interface PendingInstance {
  id: number;
  instance_no: string;
  bill_details: Array<Record<string, unknown>>;
}

// =====================================================
// 核心函数
// =====================================================

/**
 * 自动核销：扫描所有 pending 催收实例，检查单据在 ERP 中的存在状态
 */
export async function autoVerifySettledInstances(): Promise<AutoVerifyResult> {
  log.info('开始自动核销检查...');

  // 1. 获取 ERP 全量欠款 billId 集合
  const erpDebts = await fetchAllErpDebts();
  const erpBillIds = new Set(erpDebts.map(d => d.billId));
  log.info(`ERP 当前欠款单据数: ${erpBillIds.size}`);

  // 2. 查询所有 pending 状态的催收实例
  const instances = await query<PendingInstance>(
    `SELECT i.id, i.instance_no,
            i.form_data->'billDetails' AS bill_details
     FROM oa_approval_instances i
     JOIN oa_form_types ft ON i.form_type_id = ft.id
     WHERE ft.code = 'ar_collection'
       AND i.status = 'pending'
       AND jsonb_typeof(i.form_data->'billDetails') = 'array'`
  );

  const result: AutoVerifyResult = {
    checked: instances.rows.length,
    closed: 0,
    updated: 0,
    unchanged: 0,
  };

  log.info(`待检查催收实例数: ${result.checked}`);

  // 3. 逐实例检查
  for (const instance of instances.rows) {
    try {
      const billDetails = instance.bill_details;
      if (!billDetails || billDetails.length === 0) {
        result.unchanged++;
        continue;
      }

      const billNos = billDetails
        .map(b => b.billNo as string)
        .filter(Boolean);

      if (billNos.length === 0) {
        result.unchanged++;
        continue;
      }

      // 检查哪些单据已从 ERP 消失
      const disappearedIds = billNos.filter(id => !erpBillIds.has(id));

      if (disappearedIds.length === 0) {
        // 情况C：都没消失
        result.unchanged++;
        continue;
      }

      if (disappearedIds.length === billNos.length) {
        // 情况A：全部消失 → 关闭实例
        await closeInstance(instance.id, instance.instance_no, billDetails, billNos.length);
        result.closed++;
      } else {
        // 情况B：部分消失 → 标记状态 + 插入续催节点
        await markPartialSettled(instance.id, instance.instance_no, billDetails, disappearedIds);
        result.updated++;
      }
    } catch (error) {
      log.error(`自动核销处理失败 [instanceId=${instance.id}]:`, error);
      // 单个实例失败不影响其他实例
      result.unchanged++;
    }
  }

  log.info(`自动核销检查完成: 检查${result.checked}个, 关闭${result.closed}个, 更新${result.updated}个, 跳过${result.unchanged}个`);
  return result;
}

// =====================================================
// 内部辅助函数
// =====================================================

/**
 * 情况A：全部单据已核销 → 关闭实例
 */
async function closeInstance(
  instanceId: number,
  instanceNo: string,
  billDetails: Array<Record<string, unknown>>,
  totalBills: number,
): Promise<void> {
  const client = await getAppClient();
  try {
    await client.query('BEGIN');

    // 更新所有 billDetails 的 verifyStatus
    for (const bill of billDetails) {
      bill.verifyStatus = '已核销';
    }

    // 更新 form_data 中的 billDetails
    await client.query(
      `UPDATE oa_approval_instances SET form_data = jsonb_set(form_data, '{billDetails}', $1) WHERE id = $2`,
      [JSON.stringify(billDetails), instanceId]
    );

    // 标记实例为 approved
    await client.query(
      `UPDATE oa_approval_instances SET status = 'approved', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [instanceId]
    );

    // 标记所有 pending 节点为 approved
    await client.query(
      `UPDATE oa_approval_nodes SET status = 'approved', acted_at = NOW() WHERE instance_id = $1 AND status = 'pending'`,
      [instanceId]
    );

    // 插入系统评论
    const autoNodeResult = await client.query<{ node_order: number }>(
      `SELECT node_order FROM oa_approval_nodes WHERE instance_id = $1 AND node_type = 'auto' ORDER BY node_order DESC LIMIT 1`,
      [instanceId]
    );
    const commentNodeOrder = autoNodeResult.rows[0]?.node_order ?? 1;
    await client.query(
      `INSERT INTO oa_approval_actions (instance_id, action_type, operator_name, node_order, comment)
       VALUES ($1, 'comment', '系统', $2, $3)`,
      [instanceId, commentNodeOrder, `自动核销：全部${totalBills}笔单据已还款，系统自动关闭`]
    );

    await client.query('COMMIT');

    // 事务外：入队异步任务
    enqueueFinalizeProcessInstance(instanceId, 'agree').catch(err =>
      log.error(`自动核销壳实例关闭入队失败 [${instanceNo}]:`, err)
    );
    enqueueCompleteAllPendingTodos(instanceId).catch(err =>
      log.error(`自动核销待办完成入队失败 [${instanceNo}]:`, err)
    );

    log.info(`自动核销关闭: ${instanceNo} (全部${totalBills}笔已还款)`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 情况B：部分单据已核销 → 标记 verifyStatus + 插入续催节点
 */
async function markPartialSettled(
  instanceId: number,
  instanceNo: string,
  billDetails: Array<Record<string, unknown>>,
  disappearedIds: string[],
): Promise<void> {
  const disappearedSet = new Set(disappearedIds);
  const totalBills = billDetails.filter(b => b.billNo).length;
  const settledCount = disappearedIds.length;
  const remainingCount = totalBills - settledCount;

  // 更新已消失单据的 verifyStatus
  for (const bill of billDetails) {
    if (disappearedSet.has(bill.billNo as string)) {
      bill.verifyStatus = '已核销';
    }
  }

  const client = await getAppClient();
  try {
    await client.query('BEGIN');

    // 更新 form_data 中的 billDetails
    await client.query(
      `UPDATE oa_approval_instances SET form_data = jsonb_set(form_data, '{billDetails}', $1), updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(billDetails), instanceId]
    );

    // 插入系统评论
    const autoNodeResult = await client.query<{ node_order: number }>(
      `SELECT node_order FROM oa_approval_nodes WHERE instance_id = $1 AND node_type = 'auto' AND status IN ('pending', 'processing') ORDER BY node_order LIMIT 1`,
      [instanceId]
    );
    const commentNodeOrder = autoNodeResult.rows[0]?.node_order ?? 1;
    await client.query(
      `INSERT INTO oa_approval_actions (instance_id, action_type, operator_name, node_order, comment)
       VALUES ($1, 'comment', '系统', $2, $3)`,
      [instanceId, commentNodeOrder, `自动核销：${settledCount}/${totalBills}笔已还款，剩余${remainingCount}笔继续催收`]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // 事务外：插入新营销师催收节点（此函数内部有自己的事务）
  try {
    await insertCollectionNode(instanceId, '营销师催收', 'marketer', 0);
    log.info(`自动核销部分更新: ${instanceNo} (${settledCount}/${totalBills}笔已还款，插入续催节点)`);
  } catch (error) {
    log.error(`自动核销插入续催节点失败 [${instanceNo}]:`, error);
    // 节点插入失败不影响已完成的 billDetails 更新
  }
}
