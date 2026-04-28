/**
 * 催收任务生成服务
 * 从ERP逾期欠款数据生成催收任务，包含防重复和防并发机制
 *
 * 管线: queryRawDebts → enrichDebts → filterHoard → evaluateEntryRules → groupBy → createTasks
 */

import { query } from '../../db/pool';
import { getAppClient } from '../../db/appPool';
import { AR_DEFAULT_EXPIRE_DAYS, AR_SETTLE_METHOD_CONSUMER_EXPIRE } from '../../utils/constants';
import type { PoolClient } from 'pg';
import type { BatchType } from './ar-collection.types';
import type { ERPDebtRecord, EnrichedDebtRecord } from './ar-debt.types';
import { enrichDebtRecords, filterHoardDebts } from './ar-debt-enrichment.service';
import {
  evaluateEntryRules,
  extractEntryMetadata,
  COLLECTION_ENTRY_RULES,
  type CollectionEntryVerdict,
} from './ar-collection-entry-rules';
import { sendTaskCreatedNotifications } from './ar-collection-notify-task';
import { calcPriority } from './ar-collection.utils';
import { batchQueryExistingBillIds, batchQueryActiveTasks } from './ar-collection-batch-query';

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
    // 1. 查询ERP中所有欠款数据
    const rawDebts = await queryRawDebts();
    console.log(`[ARSync] ERP查询到 ${rawDebts.length} 条欠款记录`);

    // 2. 富化欠款数据（补充 hoardTag + 客户限额 + 计算字段）
    const enrichedDebts = await enrichDebtRecords(rawDebts, now);

    // 3. 排除压单欠款（硬排除，不进入任何催收流程）
    const nonHoardDebts = filterHoardDebts(enrichedDebts);
    const hoardFilteredCount = enrichedDebts.length - nonHoardDebts.length;
    if (hoardFilteredCount > 0) {
      console.log(`[ARSync] 排除 ${hoardFilteredCount} 条压单欠款`);
    }

    // 4. 批量查询已存在的 billId（幂等检查）
    const billIds = nonHoardDebts.map(d => d.billId);
    const existingBillIdSet = await batchQueryExistingBillIds(client, billIds);

    // 5. 按客户分组，评估准入规则
    const debtsByConsumer = groupByConsumer(nonHoardDebts);
    const verdicts = evaluateEntryRules(debtsByConsumer, {
      now,
      ruleConfigs: COLLECTION_ENTRY_RULES,
    });

    // 6. 提取应入催的欠款 + 元数据，同时排除已存在的 billId
    const { enteringDebts, entryReasons, entryRuleSnapshot } = extractEntryMetadata(verdicts);
    const qualifiedDebts = enteringDebts.filter(d => !existingBillIdSet.has(d.billId));

    if (qualifiedDebts.length === 0) {
      console.log('[ARSync] 无新增需催收的欠款');
      return;
    }
    console.log(`[ARSync] 发现 ${qualifiedDebts.length} 条新增需催收的欠款，入催原因: [${entryReasons.join(', ')}]`);

    // 7. 按客户+逾期触发日期分组
    const groups = groupByConsumerAndOverdueDate(qualifiedDebts);

    // 8. 批量查询已存在的活跃任务（防止重复创建）
    const existingActiveTasks = await batchQueryActiveTasks(client, Array.from(groups.keys()));

    // 9. 为每组生成任务（事务内）
    await createTasksInTransaction(client, groups, existingActiveTasks, todayStr, now, entryReasons, entryRuleSnapshot);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[ARSync] 催收任务生成失败:', error);
    throw error;
  }
}

/** 查询ERP欠款原始数据 */
async function queryRawDebts(): Promise<ERPDebtRecord[]> {
  const erpSql = `SELECT "billId", "bizOrderStr", "consumerName", "managerUsers",
    "totalAmount", "leftAmount", "settleMethod",
    "consumerExpireDay", "billTypeName", "workTime"
    FROM "客户欠款明细"
    WHERE "leftAmount"::numeric > 0`;
  const result = await query<ERPDebtRecord>(erpSql, []);
  return result.rows;
}

/** 按客户名分组 */
function groupByConsumer(debts: EnrichedDebtRecord[]): Map<string, EnrichedDebtRecord[]> {
  const groups = new Map<string, EnrichedDebtRecord[]>();
  for (const debt of debts) {
    if (!groups.has(debt.consumerName)) groups.set(debt.consumerName, []);
    groups.get(debt.consumerName)!.push(debt);
  }
  return groups;
}

/** 按客户+逾期触发日期分组 */
function groupByConsumerAndOverdueDate(debts: EnrichedDebtRecord[]): Map<string, EnrichedDebtRecord[]> {
  const groups = new Map<string, EnrichedDebtRecord[]>();
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
  groups: Map<string, EnrichedDebtRecord[]>,
  existingActiveTasks: Map<string, number>,
  todayStr: string,
  now: Date,
  globalEntryReasons: string[],
  globalRuleSnapshot: Record<string, any>,
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

    // 收集该组内所有触发的 entry reasons（去重）
    const groupReasons = [...new Set(debts.flatMap(d => globalEntryReasons))];

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

    // 插入任务（包含 entry_reasons 和 entry_rule_snapshot）
    const taskResult = await client.query(
      `INSERT INTO ar_collection_tasks
        (task_no, consumer_code, consumer_name, manager_user_id, manager_user_name,
         total_amount, bill_count, status, batch_type, batch_date, priority,
         first_overdue_date, max_overdue_days, current_handler_id, assessment_start_time,
         entry_reasons, entry_rule_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'collecting', $8, $9, $10, $11, $12, $4, CURRENT_TIMESTAMP, $13, $14::jsonb)
       RETURNING id`,
      [taskNo, consumerName, consumerName, managerUserId, managerName,
       totalAmount, debts.length, batchType, overdueDateStr, priority,
       overdueDateStr, maxOverdue,
       groupReasons,
       JSON.stringify(globalRuleSnapshot)]
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
      [taskId, `系统自动生成催收任务，批次类型=${batchType}，包含${debts.length}笔欠款，入催原因=[${groupReasons.join(',')}]`]
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
  debts: EnrichedDebtRecord[],
  now: Date
): Promise<void> {
  for (const debt of debts) {
    const workDate = new Date(debt.workTime);
    const ageDays = Math.floor((now.getTime() - workDate.getTime()) / 86400000);
    const maxDays = Number(debt.settleMethod) === AR_SETTLE_METHOD_CONSUMER_EXPIRE ? (Number(debt.consumerExpireDay) || 0) : AR_DEFAULT_EXPIRE_DAYS;
    const expireDate = new Date(workDate.getTime() + maxDays * 86400000);

    await client.query(
      `INSERT INTO ar_collection_details
        (task_id, erp_bill_id, bill_no, bill_type_name, total_amount, left_amount,
         bill_order_time, expire_time, overdue_days, status, hoard_tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
       ON CONFLICT (erp_bill_id) DO NOTHING`,
      [taskId, debt.billId, debt.bizOrderStr || debt.billId, debt.billTypeName, debt.totalAmount,
       debt.leftAmount, debt.workTime, expireDate.toISOString(), ageDays - maxDays,
       debt.hoardTag ?? null]
    );
  }
}
