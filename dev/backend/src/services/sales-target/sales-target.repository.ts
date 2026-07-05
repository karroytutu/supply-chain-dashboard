/**
 * 目标管理 - 数据访问层
 * 负责 sales_targets / sales_target_items 表的 CRUD + 缓存
 */

import { appQuery } from '../../db/appPool';
import { batchInsert } from '../../db/batch';
import type { PoolClient } from 'pg';
import { cache, CACHE_TTL } from '../../utils/cache';
import { TARGET_CACHE_PREFIX } from './cache-keys';
import type {
  SalesTarget,
  SalesTargetItem,
  SaveTargetParams,
  TargetApprovalStatus,
  TargetListQuery,
} from './sales-target.types';

/** 目标明细表列名（createTarget 和 updateTargetItems 共用） */
const TARGET_ITEM_COLUMNS = [
  'target_id', 'erp_consumer_id', 'consumer_name', 'is_planned_new',
  'erp_goods_id', 'goods_name', 'category_name', 'unit', 'unit_price',
  'target_amount', 'remark',
] as const;

/**
 * 在事务内替换目标明细：删除旧明细 + 批量插入新明细
 * createTarget 和 updateTargetItems 共用
 */
async function replaceItemsInTransaction(
  client: PoolClient,
  targetId: number,
  items: SaveTargetParams['items'],
): Promise<void> {
  await client.query('DELETE FROM sales_target_items WHERE target_id = $1', [targetId]);
  if (items.length > 0) {
    const rows = items.map(item => [
      targetId,
      item.erp_consumer_id,
      item.consumer_name,
      item.is_planned_new,
      item.erp_goods_id,
      item.goods_name,
      item.category_name,
      item.unit,
      item.unit_price,
      item.target_amount,
      item.remark,
    ]);
    await batchInsert(client, 'sales_target_items', [...TARGET_ITEM_COLUMNS], rows);
  }
}

/**
 * 查询目标列表（支持按营销师/月份过滤）
 */
export async function listTargets(query: TargetListQuery): Promise<(SalesTarget & { marketer_name: string })[]> {
  const cacheKey = `${TARGET_CACHE_PREFIX}:list:${JSON.stringify(query)}`;
  const cached = cache.get<(SalesTarget & { marketer_name: string })[]>(cacheKey);
  if (cached) return cached;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (query.marketer_id) {
    conditions.push(`t.marketer_id = $${idx++}`);
    params.push(query.marketer_id);
  }
  if (query.year) {
    conditions.push(`t.year = $${idx++}`);
    params.push(query.year);
  }
  if (query.month) {
    conditions.push(`t.month = $${idx++}`);
    params.push(query.month);
  }
  if (query.status) {
    conditions.push(`t.status = $${idx++}`);
    params.push(query.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await appQuery(
    `SELECT t.*, u.name AS marketer_name
     FROM sales_targets t
     JOIN users u ON u.id = t.marketer_id
     ${where}
     ORDER BY t.year DESC, t.month DESC, u.name`,
    params
  );

  cache.set(cacheKey, result.rows, CACHE_TTL.DASHBOARD);
  return result.rows;
}

/**
 * 获取目标主记录
 */
export async function getTargetById(id: number): Promise<(SalesTarget & { marketer_name: string }) | null> {
  const result = await appQuery(
    `SELECT t.*, u.name AS marketer_name
     FROM sales_targets t
     JOIN users u ON u.id = t.marketer_id
     WHERE t.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * 将数据库原始行中的 DECIMAL 字符串字段转换为 number
 * getTargetItems 和 getTargetItemsByTargetIds 共用
 */
function parseTargetItemRow(r: Record<string, unknown>): SalesTargetItem {
  return {
    ...r,
    target_amount: parseFloat(r.target_amount as string) || 0,
    unit_price: r.unit_price != null ? parseFloat(r.unit_price as string) : null,
  } as SalesTargetItem;
}

/**
 * 获取目标明细列表
 */
export async function getTargetItems(targetId: number): Promise<SalesTargetItem[]> {
  const cacheKey = `${TARGET_CACHE_PREFIX}:items:${targetId}`;
  const cached = cache.get<SalesTargetItem[]>(cacheKey);
  if (cached) return cached;

  const result = await appQuery(
    `SELECT * FROM sales_target_items
     WHERE target_id = $1
     ORDER BY consumer_name, category_name, goods_name`,
    [targetId]
  );

  const rows: SalesTargetItem[] = result.rows.map(parseTargetItemRow);

  cache.set(cacheKey, rows, CACHE_TTL.DASHBOARD);
  return rows;
}

/**
 * 批量获取多个目标的明细列表（用于概览接口，避免 N+1 查询）
 * 返回按 target_id 分组的 Map
 */
export async function getTargetItemsByTargetIds(
  targetIds: number[]
): Promise<Map<number, SalesTargetItem[]>> {
  if (targetIds.length === 0) return new Map();

  const result = await appQuery(
    `SELECT * FROM sales_target_items
     WHERE target_id = ANY($1)
     ORDER BY consumer_name, category_name, goods_name`,
    [targetIds]
  );

  const map = new Map<number, SalesTargetItem[]>();
  for (const rawRow of result.rows) {
    const row = parseTargetItemRow(rawRow);
    const list = map.get(row.target_id);
    if (list) {
      list.push(row);
    } else {
      map.set(row.target_id, [row]);
    }
  }
  return map;
}

/**
 * 创建目标（含明细），在事务中执行
 */
export async function createTarget(params: SaveTargetParams): Promise<SalesTarget> {
  const client = await (await import('../../db/appPool')).getAppClient();
  try {
    await client.query('BEGIN');

    // 插入主表（upsert 时仅覆盖 draft/rejected 状态，approved/pending 受保护）
    const targetResult = await client.query(
      `INSERT INTO sales_targets (marketer_id, year, month, status)
       VALUES ($1, $2, $3, 'draft')
       ON CONFLICT (marketer_id, year, month)
       DO UPDATE SET updated_at = NOW(), status = 'draft', oa_instance_id = NULL
       WHERE sales_targets.status IN ('draft', 'rejected')
       RETURNING *`,
      [params.marketer_id, params.year, params.month]
    );
    const target: SalesTarget = targetResult.rows[0];

    // 竞态保护：upsert 的 WHERE 条件未满足时（如目标已被审批），rows[0] 为 undefined
    if (!target) {
      throw new Error('目标状态已变更（可能已被审批），请刷新页面后重试');
    }

    // 替换明细（upsert 场景下先删旧再插新）
    await replaceItemsInTransaction(client, target.id, params.items);

    await client.query('COMMIT');
    invalidateTargetWriteCache();
    return target;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 更新目标明细（整体替换）
 */
export async function updateTargetItems(targetId: number, items: SaveTargetParams['items']): Promise<void> {
  const client = await (await import('../../db/appPool')).getAppClient();
  try {
    await client.query('BEGIN');

    // 更新主表：重置状态为草稿并清除旧 OA 审批关联，支持修改后重新提交
    // 仅允许非 pending 状态的目标被修改；approved 允许修改并回退为 draft
    const result = await client.query(
      "UPDATE sales_targets SET updated_at = NOW(), status = 'draft', oa_instance_id = NULL WHERE id = $1 AND status != 'pending'",
      [targetId]
    );
    if (result.rowCount === 0) {
      throw new Error('目标正在审批中，不允许修改');
    }

    // 替换明细
    await replaceItemsInTransaction(client, targetId, items);

    await client.query('COMMIT');
    invalidateTargetWriteCache();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 删除目标（级联删除明细，在事务内执行）
 */
export async function deleteTarget(targetId: number): Promise<void> {
  const client = await (await import('../../db/appPool')).getAppClient();
  try {
    await client.query('BEGIN');
    // SQL 级状态守卫：仅允许删除草稿和已拒绝的目标，防止绕过 Controller 校验
    const result = await client.query(
      "DELETE FROM sales_targets WHERE id = $1 AND status IN ('draft', 'rejected')",
      [targetId]
    );
    if (result.rowCount === 0) {
      throw new Error('目标不存在或当前状态不允许删除');
    }
    await client.query('COMMIT');
    invalidateTargetWriteCache();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 更新目标审批状态（原子操作，含乐观锁）
 * 通过 expectedStatuses 参数指定期望的当前状态，实现乐观锁防并发冲突
 * 返回 false 表示状态已被并发修改
 */
export async function updateTargetStatus(
  targetId: number,
  status: TargetApprovalStatus,
  expectedStatuses: TargetApprovalStatus[],
  oaInstanceId?: number
): Promise<boolean> {
  let result;
  if (oaInstanceId !== undefined) {
    result = await appQuery(
      `UPDATE sales_targets SET status = $1, oa_instance_id = $2, updated_at = NOW()
       WHERE id = $3 AND status = ANY($4)`,
      [status, oaInstanceId, targetId, expectedStatuses]
    );
  } else {
    result = await appQuery(
      `UPDATE sales_targets SET status = $1, updated_at = NOW()
       WHERE id = $2 AND status = ANY($3)`,
      [status, targetId, expectedStatuses]
    );
  }
  invalidateTargetWriteCache();
  return (result.rowCount ?? 0) > 0;
}

/**
 * 失效目标写入相关缓存（仅失效 items 和 list，不影响 ERP 概览缓存）
 */
function invalidateTargetWriteCache(): void {
  cache.invalidate(`${TARGET_CACHE_PREFIX}:items:`);
  cache.invalidate(`${TARGET_CACHE_PREFIX}:list:`);
}
