/**
 * 催收任务生成 - 批量查询辅助函数
 * 提供 billId 去重查询和活跃任务去重查询
 */

import type { PoolClient } from 'pg';

/** 批量查询分批大小 */
const BATCH_SIZE = 500;

/** 批量查询已存在的 billId（减少 N+1 查询） */
export async function batchQueryExistingBillIds(
  client: PoolClient,
  billIds: string[]
): Promise<Set<string>> {
  const existingSet = new Set<string>();
  if (billIds.length === 0) return existingSet;

  for (let i = 0; i < billIds.length; i += BATCH_SIZE) {
    const batch = billIds.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(',');
    const result = await client.query(
      `SELECT erp_bill_id FROM ar_collection_details
       WHERE erp_bill_id IN (${placeholders})`,
      batch
    );
    for (const row of result.rows) {
      existingSet.add(row.erp_bill_id);
    }
  }
  return existingSet;
}

/** 批量查询活跃任务（同一客户+逾期日期不可重复） */
export async function batchQueryActiveTasks(
  client: PoolClient,
  groupKeys: string[]
): Promise<Map<string, number>> {
  const consumerCodes = groupKeys.map(k => k.split('||')[0]);
  const activeTaskMap = new Map<string, number>();
  if (consumerCodes.length === 0) return activeTaskMap;

  for (let i = 0; i < consumerCodes.length; i += BATCH_SIZE) {
    const batch = consumerCodes.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(',');
    const result = await client.query(
      `SELECT consumer_code, first_overdue_date, id
       FROM ar_collection_tasks
       WHERE consumer_code IN (${placeholders})
         AND status NOT IN ('closed', 'cancelled')`,
      batch
    );
    for (const row of result.rows) {
      const activeKey = `${row.consumer_code}||${row.first_overdue_date?.toISOString().slice(0, 10)}`;
      activeTaskMap.set(activeKey, row.id);
    }
  }
  return activeTaskMap;
}
