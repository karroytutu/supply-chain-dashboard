/**
 * ERP 库存快照服务
 * 每日从实时库存表 API 拉取全量数据，存入本地 erp_inventory_snapshots 表
 * 替代原 xinshutong 数据库的 "实时库存表_每天" 表
 * @module services/erp-client/erp-snapshot.service
 */
import { SqlParam } from '../../db/types';
import { createLogger } from '../../utils/logger';
const log = createLogger('ERP');

import { appQuery } from '../../db/appPool';
import { fetchAllInventory } from './erp-inventory.service';
import { cache, CACHE_TTL } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';
import { formatDateOnly } from '../../utils/dateFormat';

/** 快照记录 */
export interface InventorySnapshot {
  snapshot_date: string;
  goods_id: number;
  goods_name: string;
  available_base_quantity: number;
  base_cost_price: number;
}

/**
 * 执行每日库存快照
 * 从 ERP 实时库存 API 拉取全量数据，写入 erp_inventory_snapshots 表
 * 应在每日定时任务中调用（如每日 23:30）
 */
export async function takeDailyInventorySnapshot(): Promise<{
  snapshotDate: string;
  recordCount: number;
}> {
  const today = new Date();
  const snapshotDate = today.toISOString().slice(0, 10);

  log.info(`开始执行每日库存快照: ${snapshotDate}`);

  // 从 ERP API 获取全量库存
  const allInventory = await fetchAllInventory(true); // skipCache=true，确保最新数据

  if (allInventory.length === 0) {
    log.warn('ERP API 返回空库存数据，跳过快照');
    return { snapshotDate, recordCount: 0 };
  }

  // 先删除今天的旧快照（幂等性）
  await appQuery(`DELETE FROM erp_inventory_snapshots WHERE snapshot_date = $1`, [snapshotDate]);

  // 批量插入新快照
  const values: string[] = [];
  const params: SqlParam[] = [];
  let paramIndex = 1;

  for (const record of allInventory) {
    values.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`
    );
    params.push(
      snapshotDate,
      record.goodsId,
      record.goodsName,
      record.availableBaseQuantity,
      parseFloat(record.baseCostPrice) || 0
    );
    paramIndex += 5;
  }

  const insertSql = `
    INSERT INTO erp_inventory_snapshots
      (snapshot_date, goods_id, goods_name, available_base_quantity, base_cost_price)
    VALUES ${values.join(', ')}
  `;

  await appQuery(insertSql, params);

  // 清除快照缓存
  cache.invalidate(CACHE_KEY.ERP_SNAPSHOT_PREFIX);

  log.info(`快照完成: ${snapshotDate}, 共 ${allInventory.length} 条记录`);

  return { snapshotDate, recordCount: allInventory.length };
}

/**
 * 查询月度战略商品齐全率趋势
 * 替代原 SQL: SELECT ... FROM "实时库存表_每天" WHERE ...
 *
 * @param goodsNames 战略商品名称列表
 * @param monthStart 月初日期（YYYY-MM-DD）
 */
export async function getMonthlyAvailability(
  goodsNames: string[],
  monthStart: string
): Promise<Map<string, number>> {
  const cacheKey = `erp:snapshot:monthly:${monthStart}:${goodsNames.length}`;

  const cached = cache.get<Map<string, number>>(cacheKey);
  if (cached) return cached;

  // 从快照表查询月度数据
  const result = await appQuery<{
    stock_date: any; // PostgreSQL DATE 返回 Date 对象
    in_stock_count: number;
  }>(
    `
    SELECT
      snapshot_date as stock_date,
      COUNT(DISTINCT goods_name) as in_stock_count
    FROM erp_inventory_snapshots
    WHERE goods_name = ANY($1)
      AND available_base_quantity > 0
      AND snapshot_date >= $2
      AND snapshot_date <= CURRENT_DATE
    GROUP BY snapshot_date
    ORDER BY snapshot_date
  `,
    [goodsNames, monthStart]
  );

  const dailyMap = new Map<string, number>();
  for (const row of result.rows) {
    dailyMap.set(formatDateOnly(row.stock_date), row.in_stock_count);
  }

  // 缓存 30 分钟
  cache.set(cacheKey, dailyMap, CACHE_TTL.LOW_FREQUENCY);

  return dailyMap;
}
