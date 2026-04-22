/**
 * 催收任务生成服务
 * 从ERP逾期欠款数据生成催收任务，包含防重复和防并发机制
 */

import { query } from '../../db/pool';
import { getAppClient } from '../../db/appPool';
import type { PoolClient } from 'pg';
import type { BatchType } from './ar-collection.types';
import { sendTaskCreatedNotifications } from './ar-collection-notify-task';
import { calcPriority } from './ar-collection.utils';
import { batchQueryExistingBillIds, batchQueryActiveTasks } from './ar-collection-batch-query';

/** ERP欠款记录 */
interface ERPDebtRecord {
  billId: string;
  bizOrderStr: string;
  consumerName: string;
  managerUsers: string;
  totalAmount: number;
  leftAmount: number;
  settleMethod: number;
  consumerExpireDay: number;
  billTypeName: string;
  workTime: string;
}

/** 逾期欠款记录（含计算字段） */
interface OverdueDebt extends ERPDebtRecord {
  overdueDays: number;
  overdueDateStr: string;
}

/** Advisory Lock 标识（用于防止并发执行） */
const ADVISORY_LOCK_ID = 20260421;

// ============================================
// 导出函数
// ============================================

/** 生成催收任务（入口函数，含 Advisory Lock 防并发） */
export async function generateCollectionTasks(): Promise<void> {
  console.log('[ARSync] 开始生成催收任务...');

  const client = await getAppClient();
  try {
    // 获取 Advisory Lock 防止并发执行
    const lockResult = await client.query(
      `SELECT pg_try_advisory_lock($1) AS locked`,
      [ADVISORY_LOCK_ID]
    );
    if (!lockResult.rows[0].locked) {
      console.log('[ARSync] 另一个催收任务生成进程正在执行，跳过本次');
      return;
    }

    try {
      await generateCollectionTasksInner(client);
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

// ============================================
// 内部函数
// ============================================

/** 催收任务生成核心逻辑（连接已获取，Lock 已持有） */
async function generateCollectionTasksInner(client: PoolClient): Promise<void> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  try {
    // 1. 查询ERP中所有已逾期且未生成任务的欠款
    const erpResult = await queryOverdueDebts();

    // 2. 批量查询已存在的 billId（减少 N+1 查询）
    const billIds = erpResult.rows.map(d => d.billId);
    const existingBillIdSet = await batchQueryExistingBillIds(client, billIds);

    // 3. 筛选出逾期且未生成任务的记录
    const overdueDebts = filterOverdueDebts(erpResult.rows, now, existingBillIdSet);

    if (overdueDebts.length === 0) {
      console.log('[ARSync] 无新增逾期欠款');
      return;
    }
    console.log(`[ARSync] 发现 ${overdueDebts.length} 条新增逾期欠款`);

    // 4. 按客户+逾期触发日期分组
    const groups = groupByConsumerAndOverdueDate(overdueDebts);

    // 5. 批量查询已存在的活跃任务（防止重复创建）
    const existingActiveTasks = await batchQueryActiveTasks(client, Array.from(groups.keys()));

    // 6. 为每组生成任务（事务内）
    await createTasksInTransaction(client, groups, existingActiveTasks, todayStr, now);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[ARSync] 催收任务生成失败:', error);
    throw error;
  }
}

/** 查询ERP欠款数据 */
async function queryOverdueDebts(): Promise<{ rows: ERPDebtRecord[] }> {
  const erpSql = `SELECT "billId", "bizOrderStr", "consumerName", "managerUsers",
    "totalAmount", "leftAmount", "settleMethod",
    "consumerExpireDay", "billTypeName", "workTime"
    FROM "客户欠款明细"
    WHERE "leftAmount"::numeric > 0`;
  return query<ERPDebtRecord>(erpSql, []);
}

/** 筛选逾期且未生成明细的记录 */
function filterOverdueDebts(
  erpDebts: ERPDebtRecord[],
  now: Date,
  existingBillIdSet: Set<string>
): OverdueDebt[] {
  const overdueDebts: OverdueDebt[] = [];

  for (const debt of erpDebts) {
    const workDate = new Date(debt.workTime);
    const ageDays = Math.floor((now.getTime() - workDate.getTime()) / 86400000);
    const maxDays = Number(debt.settleMethod) === 2 ? (Number(debt.consumerExpireDay) || 0) : 7;
    if (ageDays <= maxDays) continue;

    // 幂等检查: 是否已存在该billId的催收明细
    if (existingBillIdSet.has(debt.billId)) continue;

    const overdueDate = new Date(workDate.getTime() + maxDays * 86400000);
    const overdueDateStr = overdueDate.toISOString().slice(0, 10);
    overdueDebts.push({ ...debt, overdueDays: ageDays - maxDays, overdueDateStr });
  }
  return overdueDebts;
}

/** 按客户+逾期触发日期分组 */
function groupByConsumerAndOverdueDate(debts: OverdueDebt[]): Map<string, OverdueDebt[]> {
  const groups = new Map<string, OverdueDebt[]>();
  for (const debt of debts) {
    const key = `${debt.consumerName}||${debt.overdueDateStr}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(debt);
  }
  return groups;
}

/** 在事务内为每组生成任务 */
async function createTasksInTransaction(
  client: PoolClient,
  groups: Map<string, OverdueDebt[]>,
  existingActiveTasks: Map<string, number>,
  todayStr: string,
  now: Date
): Promise<void> {
  // 获取今日已有任务序号
  const seqResult = await client.query<{ max_seq: string }>(
    `SELECT task_no AS max_seq FROM ar_collection_tasks
     WHERE task_no LIKE $1 ORDER BY task_no DESC LIMIT 1`,
    [`AR${todayStr.replace(/-/g, '')}%`]
  );
  let seqNum = 0;
  if (seqResult.rows.length > 0) {
    const lastNo = seqResult.rows[0].max_seq;
    seqNum = parseInt(lastNo.slice(-3), 10) || 0;
  }

  const taskIdMap = new Map<string, { taskId: number; managerUserId: number | null }>();
  const skippedGroups: string[] = [];

  await client.query('BEGIN');

  for (const [key, debts] of groups) {
    const [consumerName, overdueDateStr] = key.split('||');

    // 任务级去重: 同一客户+逾期日期已有活跃任务则跳过
    if (existingActiveTasks.has(key)) {
      skippedGroups.push(key);
      console.log(`[ARSync] 跳过重复任务: ${consumerName} 逾期日=${overdueDateStr}，已有活跃任务 #${existingActiveTasks.get(key)}`);
      continue;
    }

    seqNum++;
    const taskNo = `AR${todayStr.replace(/-/g, '')}${String(seqNum).padStart(3, '0')}`;
    const totalAmount = debts.reduce((s, d) => s + Number(d.leftAmount), 0);
    const maxOverdue = Math.max(...debts.map((d) => d.overdueDays));
    const priority = calcPriority(maxOverdue);
    const batchType: BatchType = 'daily';

    // 匹配责任人
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
         first_overdue_date, max_overdue_days, current_handler_id, assessment_start_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'collecting', $8, $9, $10, $11, $12, $4, CURRENT_TIMESTAMP)
       RETURNING id`,
      [taskNo, consumerName, consumerName, managerUserId, managerName,
       totalAmount, debts.length, batchType, overdueDateStr, priority,
       overdueDateStr, maxOverdue]
    );
    const taskId = taskResult.rows[0].id;

    taskIdMap.set(consumerName, { taskId, managerUserId });

    // 插入明细（ON CONFLICT DO NOTHING 利用唯一约束防重复）
    await insertDetailsForTask(client, taskId, debts, now);

    // 记录操作日志
    await client.query(
      `INSERT INTO ar_collection_actions
        (task_id, action_type, action_result, remark, operator_name)
       VALUES ($1, 'collect', 'success', $2, '系统')`,
      [taskId, `系统自动生成催收任务，批次类型=${batchType}，包含${debts.length}笔欠款`]
    );
  }

  await client.query('COMMIT');

  if (skippedGroups.length > 0) {
    console.log(`[ARSync] 跳过 ${skippedGroups.length} 个重复任务组`);
  }
  console.log(`[ARSync] 成功生成 ${taskIdMap.size} 个催收任务`);

  // 发送任务创建通知
  try {
    await sendTaskCreatedNotifications(Array.from(taskIdMap.entries()));
  } catch (notifyErr) {
    console.error('[ARSync] 发送任务创建通知失败:', notifyErr);
  }
}

/** 插入任务关联的欠款明细 */
async function insertDetailsForTask(
  client: PoolClient,
  taskId: number,
  debts: OverdueDebt[],
  now: Date
): Promise<void> {
  for (const debt of debts) {
    const workDate = new Date(debt.workTime);
    const ageDays = Math.floor((now.getTime() - workDate.getTime()) / 86400000);
    const maxDays = Number(debt.settleMethod) === 2 ? (Number(debt.consumerExpireDay) || 0) : 7;
    const expireDate = new Date(workDate.getTime() + maxDays * 86400000);

    await client.query(
      `INSERT INTO ar_collection_details
        (task_id, erp_bill_id, bill_no, bill_type_name, total_amount, left_amount,
         bill_order_time, expire_time, overdue_days, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       ON CONFLICT (erp_bill_id) DO NOTHING`,
      [taskId, debt.billId, debt.bizOrderStr || debt.billId, debt.billTypeName, debt.totalAmount,
       debt.leftAmount, debt.workTime, expireDate.toISOString(), ageDays - maxDays]
    );
  }
}
