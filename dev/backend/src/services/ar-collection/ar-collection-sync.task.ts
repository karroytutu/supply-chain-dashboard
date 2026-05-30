/**
 * 催收数据同步定时任务
 * - syncERPDebts: 每日06:00从ERP同步欠款数据
 * - generateCollectionTasks: 每日20:00生成催收任务（已提取到 ar-collection-task-generator.ts）
 * - checkExtensionExpiry: 每2小时检查延期到期
 * - checkHoldExpiry: 每2小时检查期限压单到期
 */

import { fetchAllErpDebts } from '../erp-client/erp-debt.service';
import { appQuery, getAppClient } from '../../db/appPool';
import type { TaskStatus } from './ar-collection.types';
import type { ERPDebtRecord } from './ar-debt.types';
import { reconcileAllHoardDetails } from './ar-hoard-reconcile';
import { invalidateTaskCache, invalidateStatsCache } from './ar-collection.repository';
import { AR_HOLD_TYPE_TIME_LIMITED, AR_HOARD_TAG_HOARD, AR_DETAIL_STATUS_HOARD_EXCLUDED } from '../../utils/constants';

// 从独立模块导出任务生成函数
export { generateCollectionTasks } from './ar-collection-task-generator';

/** 本地活跃明细 */
interface LocalDetail {
  id: number;
  task_id: number;
  erp_bill_id: string;
  left_amount: number;
  status: string;
}

/** 关联任务信息 */
interface TaskInfo {
  id: number;
  status: TaskStatus;
  consumer_name: string;
  total_amount: number;
  manager_user_id: number | null;
}

// ============================================
// 1. syncERPDebts - 从ERP同步欠款数据
// ============================================

export async function syncERPDebts(): Promise<void> {
  console.log('[ARSync] 开始同步ERP欠款数据...');
  const startTime = Date.now();

  try {
    // 1. 从ERP API获取所有客户欠款明细（skipCache=true，同步任务绕过缓存）
    const erpDebts = await fetchAllErpDebts(true);
    console.log(`[ARSync] ERP API获取到 ${erpDebts.length} 条欠款记录`);

    // 2. 获取本地所有活跃明细
    const localResult = await appQuery<LocalDetail>(
      `SELECT id, task_id, erp_bill_id, left_amount, status
       FROM ar_collection_details WHERE erp_bill_id IS NOT NULL`
    );
    const localMap = new Map<string, LocalDetail>();
    for (const d of localResult.rows) {
      localMap.set(d.erp_bill_id, d);
    }

    // 3. 找出ERP中存在的billId集合
    const erpBillIds = new Set(erpDebts.map((d) => d.billId));

    // 4. 处理ERP中消失的记录
    let removedCount = 0;
    for (const local of localResult.rows) {
      if (!erpBillIds.has(local.erp_bill_id)) {
        await handleRemovedDebt(local);
        removedCount++;
      }
    }

    // 5. 插入/更新ERP中存在的记录
    let insertCount = 0;
    let updateCount = 0;
    for (const debt of erpDebts) {
      const existing = localMap.get(debt.billId);
      if (!existing) {
        // 新记录 - 暂不插入明细(等generateCollectionTasks生成任务时关联)
        insertCount++;
      } else if (Number(existing.left_amount) !== Number(debt.leftAmount)) {
        // 金额变化 - 更新
        await appQuery(
          `UPDATE ar_collection_details SET left_amount = $1 WHERE id = $2`,
          [debt.leftAmount, existing.id]
        );
        updateCount++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[ARSync] 同步完成: 新增=${insertCount}, 更新=${updateCount}, 消失=${removedCount}, 耗时=${duration}ms`);

    // 6. 压单对账（兜底机制）
    await reconcileAllHoardDetails();
  } catch (error) {
    console.error('[ARSync] ERP欠款数据同步失败:', error);
    throw error;
  }
}

// ============================================
// 2. checkExtensionExpiry - 检查延期到期
// ============================================

export async function checkExtensionExpiry(): Promise<void> {
  console.log('[ARSync] 检查延期到期...');
  try {
    // 查询已到期的延期任务
    const result = await appQuery<{ id: number; current_extension_id: number }>(
      `SELECT id, current_extension_id FROM ar_collection_tasks
       WHERE status = 'extension' AND extension_until <= CURRENT_DATE`
    );

    if (result.rows.length === 0) {
      console.log('[ARSync] 无到期延期任务');
      return;
    }

    const client = await getAppClient();
    try {
      await client.query('BEGIN');

      for (const task of result.rows) {
        // 恢复催收状态，且不允许再延期
        await client.query(
          `UPDATE ar_collection_tasks
           SET status = 'collecting', can_extend = false,
               current_extension_id = NULL, extension_until = NULL,
               assessment_start_time = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [task.id]
        );

        // 更新延期记录状态
        if (task.current_extension_id) {
          await client.query(
            `UPDATE ar_extension_records
             SET status = 'expired', expired_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [task.current_extension_id]
          );
        }

        // 记录操作日志
        await client.query(
          `INSERT INTO ar_collection_actions
            (task_id, action_type, action_result, remark, operator_name)
           VALUES ($1, 'collect', 'success', '延期到期，系统自动恢复催收，不允许再延期', '系统')`,
          [task.id]
        );
      }

      await client.query('COMMIT');

      // 失效所有任务列表缓存（批量操作可能影响多个任务）
      for (const task of result.rows) {
        invalidateTaskCache(task.id);
      }
      invalidateStatsCache();

      console.log(`[ARSync] 处理了 ${result.rows.length} 个到期延期任务，已失效相关缓存`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[ARSync] 延期到期检查失败:', error);
    throw error;
  }
}

// ============================================
// 3. checkHoldExpiry - 检查期限压单到期
// ============================================

/** 到期压单明细 */
interface ExpiredHoldDetail {
  id: number;
  task_id: number;
  hold_type: string;
  hold_until: string;
}

export async function checkHoldExpiry(): Promise<void> {
  console.log('[ARSync] 检查期限压单到期...');
  try {
    // 查询已到期的期限压单明细（利用部分索引高效扫描）
    const result = await appQuery<ExpiredHoldDetail>(
      `SELECT id, task_id, hold_type, hold_until::text
       FROM ar_collection_details
       WHERE hold_type = $1
         AND hold_until <= CURRENT_DATE
         AND hoard_tag = $2
         AND status = $3`,
      [AR_HOLD_TYPE_TIME_LIMITED, AR_HOARD_TAG_HOARD, AR_DETAIL_STATUS_HOARD_EXCLUDED]
    );

    if (result.rows.length === 0) {
      console.log('[ARSync] 无到期期限压单');
      return;
    }

    const client = await getAppClient();
    try {
      await client.query('BEGIN');

      // 按 task_id 分组处理
      const byTask = new Map<number, ExpiredHoldDetail[]>();
      for (const detail of result.rows) {
        const existing = byTask.get(detail.task_id) || [];
        existing.push(detail);
        byTask.set(detail.task_id, existing);
      }

      const affectedTaskIds: number[] = [];

      for (const [taskId, details] of byTask) {
        const detailIds = details.map(d => d.id);

        // 1. 恢复明细状态：hoard_excluded → pending，清除 hold 元数据
        await client.query(
          `UPDATE ar_collection_details
           SET status = 'pending', hoard_tag = NULL,
               hold_type = NULL, hold_days = NULL, hold_until = NULL
           WHERE id = ANY($1)`,
          [detailIds]
        );

        // 2. 重算任务指标
        const recalcResult = await client.query<{ total: string; cnt: string; max_overdue: string }>(
          `SELECT COALESCE(SUM(left_amount), 0)::numeric as total,
                  COUNT(*)::int as cnt,
                  COALESCE(MAX(overdue_days), 0)::int as max_overdue
           FROM ar_collection_details
           WHERE task_id = $1 AND status != $2`,
          [taskId, AR_DETAIL_STATUS_HOARD_EXCLUDED]
        );
        const newTotal = Number(recalcResult.rows[0].total);
        const newCount = Number(recalcResult.rows[0].cnt);
        const newMaxOverdue = Number(recalcResult.rows[0].max_overdue);

        await client.query(
          `UPDATE ar_collection_tasks
           SET total_amount = $1, bill_count = $2, max_overdue_days = $3
           WHERE id = $4`,
          [newTotal, newCount, newMaxOverdue, taskId]
        );

        // 3. 若任务因所有明细被排除而关闭 → 重新打开
        const taskResult = await client.query<{ status: string }>(
          `SELECT status FROM ar_collection_tasks WHERE id = $1`,
          [taskId]
        );
        if (taskResult.rows[0]?.status === 'closed' && newCount > 0) {
          await client.query(
            `UPDATE ar_collection_tasks SET status = 'collecting' WHERE id = $1`,
            [taskId]
          );
        }

        // 4. 记录操作日志
        await client.query(
          `INSERT INTO ar_collection_actions
            (task_id, action_type, action_result, remark, operator_name)
           VALUES ($1, $2, 'success', $3, '系统')`,
          [
            taskId,
            AR_DETAIL_STATUS_HOARD_EXCLUDED,
            `${details.length}笔期限压单到期，自动恢复催收。到期日: ${details[0].hold_until}`,
          ]
        );

        affectedTaskIds.push(taskId);
      }

      await client.query('COMMIT');

      // 5. 失效缓存
      for (const taskId of affectedTaskIds) {
        invalidateTaskCache(taskId);
      }
      invalidateStatsCache();

      console.log(`[ARSync] 处理了 ${result.rows.length} 条到期期限压单，涉及 ${affectedTaskIds.length} 个任务，已失效相关缓存`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[ARSync] 期限压单到期检查失败:', error);
    throw error;
  }
}

// ============================================
// 4. handleRemovedDebt - 处理ERP中消失的欠款
// ============================================

async function handleRemovedDebt(detail: LocalDetail): Promise<void> {
  // 查询关联任务
  const taskResult = await appQuery<TaskInfo>(
    `SELECT id, status, consumer_name, total_amount, manager_user_id
     FROM ar_collection_tasks WHERE id = $1`,
    [detail.task_id]
  );
  if (taskResult.rows.length === 0) return;

  const task = taskResult.rows[0];

  // 如果任务已关闭，跳过处理，避免重复记录历史
  if (task.status === 'closed') {
    console.log(`[ARSync] 任务 #${task.id} 已关闭，跳过处理`);
    return;
  }

  // 自动关闭任务（所有非关闭状态统一处理）
  await appQuery(
    `UPDATE ar_collection_tasks SET status = 'closed' WHERE id = $1`,
    [task.id]
  );
  await appQuery(
    `INSERT INTO ar_collection_actions
      (task_id, action_type, action_result, remark, operator_name)
     VALUES ($1, 'erp_auto_closed', 'success', $2, '系统')`,
    [task.id, `ERP数据已消失，系统自动关闭任务。原状态: ${task.status}`]
  );
  invalidateTaskCache(detail.task_id);
  invalidateStatsCache();
  console.log(`[ARSync] 自动关闭任务 #${task.id}(${task.consumer_name})，原状态=${task.status}`);
}
