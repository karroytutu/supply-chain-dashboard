/**
 * 催收数据同步与任务生成定时任务
 * - syncERPDebts: 每日06:00从ERP同步欠款数据
 * - generateCollectionTasks: 每日20:00生成催收任务
 * - checkExtensionExpiry: 每2小时检查延期到期
 */

import { query } from '../../db/pool';
import { appQuery, getAppClient } from '../../db/appPool';
import type { Priority, BatchType, TaskStatus } from './ar-collection.types';

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
  }
}

// ============================================
// 2. generateCollectionTasks - 生成催收任务
// ============================================

export async function generateCollectionTasks(): Promise<void> {
  console.log('[ARSync] 开始生成催收任务...');

  try {
    // 1. 查询ERP中所有已逾期且未生成任务的欠款
    const erpSql = `SELECT "billId", "bizOrderStr", "consumerName", "managerUsers",
      "totalAmount", "leftAmount", "settleMethod",
      "consumerExpireDay", "billTypeName", "workTime"
      FROM "客户欠款明细"
      WHERE "leftAmount"::numeric > 0`;
    const erpResult = await query<ERPDebtRecord>(erpSql, []);

    // 2. 筛选出逾期且未生成任务的记录
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const overdueDebts: (ERPDebtRecord & { overdueDays: number })[] = [];

    for (const debt of erpResult.rows) {
      const workDate = new Date(debt.workTime);
      const ageDays = Math.floor((now.getTime() - workDate.getTime()) / 86400000);
      // 注意: PostgreSQL numeric 类型返回字符串，需要转换为数字比较
      const maxDays = Number(debt.settleMethod) === 2 ? (Number(debt.consumerExpireDay) || 0) : 7;
      if (ageDays <= maxDays) continue;

      // 幂等检查: 是否已存在该billId的催收明细
      const existsResult = await appQuery(
        `SELECT 1 FROM ar_collection_details WHERE erp_bill_id = $1 LIMIT 1`,
        [debt.billId]
      );
      if (existsResult.rows.length > 0) continue;

      overdueDebts.push({ ...debt, overdueDays: ageDays - maxDays });
    }

    if (overdueDebts.length === 0) {
      console.log('[ARSync] 无新增逾期欠款');
      return;
    }
    console.log(`[ARSync] 发现 ${overdueDebts.length} 条新增逾期欠款`);

    // 3. 按客户+逾期日期分组
    const groups = new Map<string, (ERPDebtRecord & { overdueDays: number })[]>();
    for (const debt of overdueDebts) {
      const batchDate = new Date(debt.workTime).toISOString().slice(0, 10);
      const key = `${debt.consumerName}||${batchDate}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(debt);
    }

    // 4. 获取今日已有任务序号
    const seqResult = await appQuery<{ max_seq: string }>(
      `SELECT task_no AS max_seq FROM ar_collection_tasks
       WHERE task_no LIKE $1 ORDER BY task_no DESC LIMIT 1`,
      [`AR${todayStr.replace(/-/g, '')}%`]
    );
    let seqNum = 0;
    if (seqResult.rows.length > 0) {
      const lastNo = seqResult.rows[0].max_seq;
      seqNum = parseInt(lastNo.slice(-3), 10) || 0;
    }

    // 5. 为每组生成任务
    const client = await getAppClient();
    try {
      await client.query('BEGIN');

      for (const [key, debts] of groups) {
        const [consumerName, batchDate] = key.split('||');
        seqNum++;
        const taskNo = `AR${todayStr.replace(/-/g, '')}${String(seqNum).padStart(3, '0')}`;

        const totalAmount = debts.reduce((s, d) => s + Number(d.leftAmount), 0);
        const maxOverdue = Math.max(...debts.map((d) => d.overdueDays));
        const priority = calcPriority(maxOverdue);
        // 首次同步已完成，后续任务均为日常批次
        const batchType: BatchType = 'daily';
        const firstOverdueDate = debts
          .map((d) => new Date(d.workTime))
          .sort((a, b) => a.getTime() - b.getTime())[0]
          .toISOString().slice(0, 10);

        // 匹配责任人(取第一条的managerUsers)
        const managerName = debts[0].managerUsers || null;
        let managerUserId: number | null = null;
        if (managerName) {
          const userResult = await client.query(
            `SELECT id FROM users WHERE name = $1 LIMIT 1`,
            [managerName]
          );
          if (userResult.rows.length > 0) managerUserId = userResult.rows[0].id;
        }

        // 插入任务
        const taskResult = await client.query(
          `INSERT INTO ar_collection_tasks
            (task_no, consumer_code, consumer_name, manager_user_id, manager_user_name,
             total_amount, bill_count, status, batch_type, batch_date, priority,
             first_overdue_date, max_overdue_days, current_handler_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'collecting', $8, $9, $10, $11, $12, $4)
           RETURNING id`,
          [taskNo, consumerName, consumerName, managerUserId, managerName,
           totalAmount, debts.length, batchType, batchDate, priority,
           firstOverdueDate, maxOverdue]
        );
        const taskId = taskResult.rows[0].id;

        // 插入明细
        for (const debt of debts) {
          const workDate = new Date(debt.workTime);
          const ageDays = Math.floor((now.getTime() - workDate.getTime()) / 86400000);
          // 注意: PostgreSQL numeric 类型返回字符串，需要转换为数字比较
          const maxDays = Number(debt.settleMethod) === 2 ? (Number(debt.consumerExpireDay) || 0) : 7;
          const expireDate = new Date(workDate.getTime() + maxDays * 86400000);

          await client.query(
            `INSERT INTO ar_collection_details
              (task_id, erp_bill_id, bill_no, bill_type_name, total_amount, left_amount,
               bill_order_time, expire_time, overdue_days, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
            [taskId, debt.billId, debt.bizOrderStr || debt.billId, debt.billTypeName, debt.totalAmount,
             debt.leftAmount, debt.workTime, expireDate.toISOString(), ageDays - maxDays]
          );
        }

        // 记录操作日志
        await client.query(
          `INSERT INTO ar_collection_actions
            (task_id, action_type, action_result, remark, operator_name)
           VALUES ($1, 'collect', 'success', $2, '系统')`,
          [taskId, `系统自动生成催收任务，批次类型=${batchType}，包含${debts.length}笔欠款`]
        );
      }

      await client.query('COMMIT');
      console.log(`[ARSync] 成功生成 ${groups.size} 个催收任务`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[ARSync] 催收任务生成失败:', error);
  }
}

// ============================================
// 3. checkExtensionExpiry - 检查延期到期
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

// ============================================
// 辅助函数
// ============================================

/** 根据逾期天数计算优先级 */
function calcPriority(overdueDays: number): Priority {
  if (overdueDays >= 30) return 'critical';
  if (overdueDays >= 15) return 'high';
  if (overdueDays >= 7) return 'medium';
  return 'low';
}
