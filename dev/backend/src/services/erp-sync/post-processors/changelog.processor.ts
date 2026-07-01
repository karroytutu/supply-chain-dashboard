/**
 * 变更日志后置处理器
 * 对比本次同步数据与旧快照数据，生成 changelog 记录
 * @module services/erp-sync/post-processors/changelog
 */

import { createLogger } from '../../../utils/logger';
import { appQuery } from '../../../db/appPool';

const log = createLogger('ChangelogProcessor');

/** 单条变更记录 */
interface ChangeRecord {
  datasetId: string;
  entityKey: string;
  changeType: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * 处理欠款变更日志
 * 比较新旧数据，批量写入 erp_debt_changes 表
 * @param oldDebts UPSERT 前的旧快照数据
 * @param newDebts 本次同步的新数据
 */
export async function processDebtChangelog(
  oldDebts: Record<string, unknown>[],
  newDebts: Record<string, unknown>[]
): Promise<{ added: number; removed: number; changed: number }> {
  const oldMap = new Map(oldDebts.map(r => [r.bill_id as string, r.left_amount as number]));
  const newMap = new Map(newDebts.map(d => [d.bill_id as string, d.left_amount as number]));

  const changes: ChangeRecord[] = [];

  // 检测新增和变更
  for (const [billId, newAmount] of newMap) {
    if (!oldMap.has(billId)) {
      changes.push({ datasetId: 'debts', entityKey: billId, changeType: 'new', fieldName: null, oldValue: null, newValue: String(newAmount) });
    } else {
      const oldAmount = oldMap.get(billId)!;
      if (Math.abs(oldAmount - newAmount) > 0.01) {
        changes.push({ datasetId: 'debts', entityKey: billId, changeType: 'changed', fieldName: 'left_amount', oldValue: String(oldAmount), newValue: String(newAmount) });
      }
    }
  }

  // 检测消失
  for (const [billId] of oldMap) {
    if (!newMap.has(billId)) {
      changes.push({ datasetId: 'debts', entityKey: billId, changeType: 'gone', fieldName: null, oldValue: null, newValue: null });
    }
  }

  if (changes.length === 0) {
    return { added: 0, removed: 0, changed: 0 };
  }

  // 批量写入（PostgreSQL 参数上限 65535，每行 6 列，每批最多 10000 行）
  const BATCH_LIMIT = 10000;
  for (let i = 0; i < changes.length; i += BATCH_LIMIT) {
    const batch = changes.slice(i, i + BATCH_LIMIT);
    const values = batch.map((_, j) =>
      `($${j * 6 + 1}, $${j * 6 + 2}, $${j * 6 + 3}, $${j * 6 + 4}, $${j * 6 + 5}, $${j * 6 + 6})`
    ).join(', ');
    const params = batch.flatMap(c => [c.datasetId, c.entityKey, c.changeType, c.fieldName, c.oldValue, c.newValue]);
    await appQuery(
      `INSERT INTO erp_debt_changes (dataset_id, entity_key, change_type, field_name, old_value, new_value) VALUES ${values}`,
      params
    );
  }

  const added = changes.filter(c => c.changeType === 'new').length;
  const removed = changes.filter(c => c.changeType === 'gone').length;
  const changed = changes.filter(c => c.changeType === 'changed').length;

  log.info(`欠款变更日志: 新增=${added}, 消失=${removed}, 变更=${changed}`);
  return { added, removed, changed };
}
