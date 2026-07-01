/**
 * 目标管理 - 数据访问层
 * 负责 sales_targets / sales_target_items 表的 CRUD + 缓存
 */

import { appQuery } from '../../db/appPool';
import { batchInsert } from '../../db/batch';
import { cache, CACHE_TTL } from '../../utils/cache';
import type {
  SalesTarget,
  SalesTargetItem,
  SaveTargetParams,
  TargetListQuery,
} from './sales-target.types';

const CACHE_PREFIX = 'sales:target';

/**
 * 查询目标列表（支持按营销师/月份过滤）
 */
export async function listTargets(query: TargetListQuery): Promise<(SalesTarget & { marketer_name: string })[]> {
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

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await appQuery(
    `SELECT t.*, u.name AS marketer_name
     FROM sales_targets t
     JOIN users u ON u.id = t.marketer_id
     ${where}
     ORDER BY t.year DESC, t.month DESC, u.name`,
    params
  );

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
 * 获取目标明细列表
 */
export async function getTargetItems(targetId: number): Promise<SalesTargetItem[]> {
  const cacheKey = `${CACHE_PREFIX}:items:${targetId}`;
  const cached = cache.get<SalesTargetItem[]>(cacheKey);
  if (cached) return cached;

  const result = await appQuery(
    `SELECT * FROM sales_target_items
     WHERE target_id = $1
     ORDER BY consumer_name, category_name, goods_name`,
    [targetId]
  );

  cache.set(cacheKey, result.rows, CACHE_TTL.DASHBOARD);
  return result.rows;
}

/**
 * 创建目标（含明细），在事务中执行
 */
export async function createTarget(params: SaveTargetParams): Promise<SalesTarget> {
  const client = await (await import('../../db/appPool')).getAppClient();
  try {
    await client.query('BEGIN');

    // 插入主表
    const targetResult = await client.query(
      `INSERT INTO sales_targets (marketer_id, year, month)
       VALUES ($1, $2, $3)
       ON CONFLICT (marketer_id, year, month)
       DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [params.marketer_id, params.year, params.month]
    );
    const target: SalesTarget = targetResult.rows[0];

    // 删除旧明细（如果是 upsert 场景）
    await client.query('DELETE FROM sales_target_items WHERE target_id = $1', [target.id]);

    // 批量插入新明细（使用分批工具，避免参数上限）
    if (params.items.length > 0) {
      const columns = [
        'target_id', 'erp_consumer_id', 'consumer_name', 'is_planned_new',
        'erp_goods_id', 'goods_name', 'category_name', 'unit', 'unit_price',
        'target_amount', 'remark',
      ];
      const rows = params.items.map(item => [
        target.id,
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
      await batchInsert(client, 'sales_target_items', columns, rows);
    }

    await client.query('COMMIT');
    invalidateTargetCache(target.id);
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

    // 更新主表 updated_at
    await client.query(
      'UPDATE sales_targets SET updated_at = NOW() WHERE id = $1',
      [targetId]
    );

    // 删除旧明细
    await client.query('DELETE FROM sales_target_items WHERE target_id = $1', [targetId]);

    // 批量插入新明细（使用分批工具）
    if (items.length > 0) {
      const columns = [
        'target_id', 'erp_consumer_id', 'consumer_name', 'is_planned_new',
        'erp_goods_id', 'goods_name', 'category_name', 'unit', 'unit_price',
        'target_amount', 'remark',
      ];
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
      await batchInsert(client, 'sales_target_items', columns, rows);
    }

    await client.query('COMMIT');
    invalidateTargetCache(targetId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 删除目标（级联删除明细）
 */
export async function deleteTarget(targetId: number): Promise<void> {
  await appQuery('DELETE FROM sales_targets WHERE id = $1', [targetId]);
  invalidateTargetCache(targetId);
}

/**
 * 失效目标相关缓存
 */
function invalidateTargetCache(targetId: number): void {
  cache.invalidate(`${CACHE_PREFIX}:`);
}
