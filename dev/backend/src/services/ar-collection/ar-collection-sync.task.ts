/**
 * 催收数据同步定时任务
 * - syncERPDebts: 每日06:00从ERP同步欠款数据
 * - generateCollectionTasks: 每日20:00生成催收任务（已提取到 ar-collection-task-generator.ts）
 * - checkExtensionExpiry: 每2小时检查延期到期
 */

import { query } from '../../db/pool';
import { appQuery, getAppClient } from '../../db/appPool';
import type { TaskStatus } from './ar-collection.types';

// 从独立模块导出任务生成函数
export { generateCollectionTasks } from './ar-collection-task-generator';

/** ERP欠款记录 */
interface ERPDebtRecord {
  billId: string;
  bizOrderStr: string;  // 订单号（单据编号）
  consumerName: string;
  managerUsers: string;
  totalAmount: number;
  leftAmount: number;
  settleMethod: number;
  consumerExpireDay: number;
  billTypeName: string;
  workTime: string;
}

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
    // 1. 从ERP查询所有客户欠款明细
    const erpSql = `SELECT "billId", "bizOrderStr", "consumerName", "managerUsers",
      "totalAmount", "leftAmount", "settleMethod",
      "consumerExpireDay", "billTypeName", "workTime"
      FROM "客户欠款明细" WHERE "leftAmount"::numeric > 0`;
    const erpResult = await query<ERPDebtRecord>(erpSql, []);
    const erpDebts = erpResult.rows;
    console.log(`[ARSync] ERP查询到 ${erpDebts.length} 条欠款记录`);

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
               current_extension_id = NULL, extension_until = NULL
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
      console.log(`[ARSync] 处理了 ${result.rows.length} 个到期延期任务`);
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
// 3. handleRemovedDebt - 处理ERP中消失的欠款
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

  // 根据任务状态决定处理方式
  if (task.status === 'pending_verify' || task.status === 'verified') {
    // 保持状态，仅记录日志
    await appQuery(
      `INSERT INTO ar_collection_actions
        (task_id, action_type, action_result, remark, operator_name)
       VALUES ($1, 'erp_auto_closed', 'success', $2, '系统')`,
      [task.id, `ERP数据已消失，任务状态=${task.status}，保持当前状态`]
    );
  } else {
    // 其他状态: 自动关闭任务
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
    console.log(`[ARSync] 自动关闭任务 #${task.id}(${task.consumer_name})，原状态=${task.status}`);
  }
}
