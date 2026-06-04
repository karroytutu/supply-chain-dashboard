/**
 * 压单检测服务
 * 在催收任务生成后，ERP 中的单据可能因客户授信审批而变为压单，
 * 已生成的催收任务需要同步调整。
 *
 * 双重触发机制：
 * - 即时：压单审批通过后调用 detectHoardChangesByCustomer
 * - 兜底：syncERPDebts 每日定时调用 detectAllHoardChanges
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ArCollection');

import { appQuery, getAppClient } from '../../db/appPool';
import {
  AR_HOARD_TAG_HOARD,
  AR_DETAIL_STATUS_HOARD_EXCLUDED,
  AR_HOLD_TYPE_LONG_TERM,
  AR_HOLD_TYPE_TIME_LIMITED,
} from '../../utils/constants';
import { fetchCustomerData, fetchHoardTags } from './ar-debt-enrichment.service';
import type { ERPDebtRecord } from './ar-debt.types';

// ============================================
// 内部类型
// ============================================

/** 待检测的活跃明细（带任务上下文） */
interface DetectableDetail {
  id: number;
  task_id: number;
  erp_bill_id: string;
  left_amount: number;
  status: string;
  hoard_tag: string | null;
  consumer_name: string;
  task_status: string;
}

/** 压单选项（审批回调传入） */
export interface HoldOptions {
  /** 压单类型: long_term | time_limited */
  holdType: string;
  /** 期限压单天数（仅 time_limited 有效） */
  holdDays: number | null;
}

// ============================================
// 导出函数
// ============================================

/**
 * 对所有活跃任务执行压单检测（定时兜底）
 * 在 syncERPDebts 末尾调用
 */
export async function detectAllHoardChanges(): Promise<void> {
  log.info('开始全量压单检测...');
  const startTime = Date.now();

  try {
    // 1. 查询所有活跃任务中可能变为压单的明细
    const details = await fetchDetectableDetails();
    if (details.length === 0) {
      log.info('无需检测的明细');
      return;
    }
    log.info(`扫描 ${details.length} 条活跃明细`);

    // 2. 获取最新 hoardTag 并处理变更
    const changedDetails = await detectHoardChanges(details);
    if (changedDetails.length === 0) {
      log.info('无压单变更');
      return;
    }

    // 3. 处理变更
    const result = await processHoardChanges(changedDetails);

    const duration = Date.now() - startTime;
    log.info(
      `[HoardDetect] 全量检测完成: 变更=${changedDetails.length}, ` +
        `排除=${result.excludedCount}, 重算任务=${result.recalculatedTasks}, ` +
        `关闭任务=${result.closedTasks}, 耗时=${duration}ms`
    );
  } catch (error) {
    log.error('全量压单检测失败:', error);
    // 不抛出异常，避免影响 syncERPDebts 的其他步骤
  }
}

/**
 * 对指定客户的活跃任务执行压单检测（即时触发）
 * 在压单审批通过后调用
 * @param consumerName 客户名称
 * @param holdOptions 压单选项（类型+天数），来自审批表单
 */
export async function detectHoardChangesByCustomer(
  consumerName: string,
  holdOptions?: HoldOptions
): Promise<void> {
  log.info(`开始客户压单检测: ${consumerName}`);
  const startTime = Date.now();

  try {
    // 1. 查询该客户的活跃任务明细
    const details = await fetchDetectableDetails(consumerName);
    if (details.length === 0) {
      log.info(`客户 ${consumerName} 无需检测的明细`);
      return;
    }

    // 2. 获取最新 hoardTag 并处理变更
    const changedDetails = await detectHoardChanges(details);
    if (changedDetails.length === 0) {
      log.info(`客户 ${consumerName} 无压单变更`);
      return;
    }

    // 3. 处理变更
    const result = await processHoardChanges(changedDetails, holdOptions);

    const duration = Date.now() - startTime;
    log.info(
      `[HoardDetect] 客户检测完成: ${consumerName}, 变更=${changedDetails.length}, ` +
        `排除=${result.excludedCount}, 重算任务=${result.recalculatedTasks}, ` +
        `关闭任务=${result.closedTasks}, 耗时=${duration}ms`
    );
  } catch (error) {
    log.error(`客户 ${consumerName} 压单检测失败:`, error);
    throw error;
  }
}

// ============================================
// 内部函数
// ============================================

/**
 * 查询待检测的活跃明细
 * @param consumerName 可选，指定客户名称（即时检测时使用）
 */
async function fetchDetectableDetails(consumerName?: string): Promise<DetectableDetail[]> {
  const params: string[] = [];
  let consumerFilter = '';

  if (consumerName) {
    params.push(consumerName);
    consumerFilter = `AND t.consumer_name = $${params.length}`;
  }

  const result = await appQuery<DetectableDetail>(
    `SELECT d.id, d.task_id, d.erp_bill_id, d.left_amount, d.status,
            d.hoard_tag, t.consumer_name, t.status as task_status
     FROM ar_collection_details d
     JOIN ar_collection_tasks t ON d.task_id = t.id
     WHERE t.status NOT IN ('closed')
       AND d.erp_bill_id IS NOT NULL
       AND (d.hoard_tag IS NULL OR d.hoard_tag != $${params.length + 1})
       AND d.status != $${params.length + 2}
       ${consumerFilter}`,
    [...params, AR_HOARD_TAG_HOARD, AR_DETAIL_STATUS_HOARD_EXCLUDED]
  );
  return result.rows;
}

/**
 * 获取最新 hoardTag 并识别变为 HOARD 的明细
 */
async function detectHoardChanges(details: DetectableDetail[]): Promise<DetectableDetail[]> {
  if (details.length === 0) return [];

  // 1. 按 consumer_name 分组获取客户数据
  const consumerNames = [...new Set(details.map(d => d.consumer_name))];
  const { nameToTraderId } = await fetchCustomerData(consumerNames);

  // 2. 构造最小 ERPDebtRecord stub
  // 注意：故意省略 hoardTag，使 fetchHoardTags 强制从结算单 API 获取最新压单状态，
  // 而非使用 fetchAllErpDebts 中的缓存值，确保压单检测的实时性
  const debtStubs: ERPDebtRecord[] = details.map(d => ({
    billId: d.erp_bill_id,
    bizOrderStr: '',
    consumerName: d.consumer_name,
    managerUsers: '',
    totalAmount: 0,
    leftAmount: 0,
    settleMethod: 0,
    consumerExpireDay: 0,
    billTypeName: '',
    workTime: '',
  }));

  // 3. 获取最新 hoardTag 映射
  const hoardTagMap = await fetchHoardTags(debtStubs, nameToTraderId);

  // 4. 筛选变为 HOARD 的明细
  return details.filter(d => {
    const latestTag = hoardTagMap.get(d.erp_bill_id);
    return latestTag === AR_HOARD_TAG_HOARD && d.hoard_tag !== AR_HOARD_TAG_HOARD;
  });
}

/**
 * 处理压单变更
 * 按 task_id 分组：更新明细状态/标记 → 重算任务指标 → 级联关闭 → 记录日志
 * @param holdOptions 压单选项（类型+天数），即时检测时由审批回调传入，定时兜底时为空（默认长期压单）
 */
async function processHoardChanges(
  changedDetails: DetectableDetail[],
  holdOptions?: HoldOptions
): Promise<{ excludedCount: number; recalculatedTasks: number; closedTasks: number }> {
  let excludedCount = 0;
  let recalculatedTasks = 0;
  let closedTasks = 0;

  // 压单元数据：未传入时默认为长期压单
  const holdType = holdOptions?.holdType || AR_HOLD_TYPE_LONG_TERM;
  const holdDays = holdOptions?.holdDays ?? null;

  // 按 task_id 分组
  const byTask = new Map<number, DetectableDetail[]>();
  for (const detail of changedDetails) {
    const existing = byTask.get(detail.task_id) || [];
    existing.push(detail);
    byTask.set(detail.task_id, existing);
  }

  const client = await getAppClient();
  try {
    await client.query('BEGIN');

    for (const [taskId, taskDetails] of byTask) {
      // 区分 pending vs 非 pending
      const pendingIds = taskDetails.filter(d => d.status === 'pending').map(d => d.id);
      const nonPendingIds = taskDetails.filter(d => d.status !== 'pending').map(d => d.id);

      // 更新 pending 明细：标记为 hoard_excluded + 更新 hoard_tag + hold 元数据
      if (pendingIds.length > 0) {
        await client.query(
          `UPDATE ar_collection_details
           SET status = $1, hoard_tag = $2, hold_type = $3::varchar, hold_days = $4::integer,
               hold_until = CASE WHEN $3::varchar = $5::varchar AND $4::integer IS NOT NULL
                                 THEN CURRENT_DATE + $4::integer
                                 ELSE NULL END
           WHERE id = ANY($6)`,
          [
            AR_DETAIL_STATUS_HOARD_EXCLUDED,
            AR_HOARD_TAG_HOARD,
            holdType,
            holdDays,
            AR_HOLD_TYPE_TIME_LIMITED,
            pendingIds,
          ]
        );
        excludedCount += pendingIds.length;
      }

      // 更新非 pending 明细：仅更新 hoard_tag + hold 元数据（不中断已有业务流程）
      if (nonPendingIds.length > 0) {
        await client.query(
          `UPDATE ar_collection_details
           SET hoard_tag = $1, hold_type = $2::varchar, hold_days = $3::integer,
               hold_until = CASE WHEN $2::varchar = $4::varchar AND $3::integer IS NOT NULL
                                 THEN CURRENT_DATE + $3::integer
                                 ELSE NULL END
           WHERE id = ANY($5)`,
          [AR_HOARD_TAG_HOARD, holdType, holdDays, AR_HOLD_TYPE_TIME_LIMITED, nonPendingIds]
        );
      }

      // 重算任务指标（排除 hoard_excluded 的明细）
      const recalcResult = await client.query<{ total: string; cnt: string }>(
        `SELECT COALESCE(SUM(left_amount), 0)::numeric as total,
                COUNT(*)::int as cnt
         FROM ar_collection_details
         WHERE task_id = $1 AND status != $2`,
        [taskId, AR_DETAIL_STATUS_HOARD_EXCLUDED]
      );
      const newTotal = Number(recalcResult.rows[0].total);
      const newCount = Number(recalcResult.rows[0].cnt);

      await client.query(
        `UPDATE ar_collection_tasks SET total_amount = $1, bill_count = $2 WHERE id = $3`,
        [newTotal, newCount, taskId]
      );
      recalculatedTasks++;

      // 级联关闭：所有可催收明细都被排除
      if (newCount === 0) {
        await client.query(`UPDATE ar_collection_tasks SET status = 'closed' WHERE id = $1`, [
          taskId,
        ]);
        closedTasks++;
      }

      // 记录操作日志
      const pendingCount = pendingIds.length;
      const nonPendingCount = nonPendingIds.length;
      const remarkParts: string[] = [];
      const holdTypeLabel =
        holdType === AR_HOLD_TYPE_TIME_LIMITED ? `期限压单(${holdDays}天)` : '长期压单';
      if (pendingCount > 0) {
        remarkParts.push(`${pendingCount}笔待处理明细标记为压单排除[${holdTypeLabel}]`);
      }
      if (nonPendingCount > 0) {
        remarkParts.push(`${nonPendingCount}笔处理中明细标记压单[${holdTypeLabel}]（状态不变）`);
      }
      if (newCount === 0) {
        remarkParts.push('所有明细已排除，任务自动关闭');
      }

      await client.query(
        `INSERT INTO ar_collection_actions
          (task_id, action_type, action_result, remark, operator_name)
         VALUES ($1, $2, 'success', $3, '系统')`,
        [taskId, AR_DETAIL_STATUS_HOARD_EXCLUDED, remarkParts.join('；')]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { excludedCount, recalculatedTasks, closedTasks };
}
