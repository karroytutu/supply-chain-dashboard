/**
 * 快照后置处理器
 * 从本地表生成每日快照（如库存快照 v2）
 * @module services/erp-sync/post-processors/snapshot
 */

import { createLogger } from '../../../utils/logger';
import { appQuery } from '../../../db/appPool';
import { beijingDate } from '../../../utils/beijingTime';

const log = createLogger('SnapshotProcessor');

/**
 * 生成库存每日快照 v2
 * 从 erp_inventory 表聚合到 erp_inventory_snapshots_v2
 */
export async function processInventorySnapshot(): Promise<number> {
  const today = beijingDate();

  const result = await appQuery(
    `INSERT INTO erp_inventory_snapshots_v2
       (snapshot_date, goods_id, warehouse_id, goods_name, available_base_quantity, base_cost_price, warehouse_name, type_chain_name, quality_type, brand_name)
     SELECT $1::date, goods_id, warehouse_id, goods_name,
            available_base_quantity, base_cost_price::numeric,
            warehouse_name, type_chain_name, quality_type, brand_name
     FROM erp_inventory
     ON CONFLICT (snapshot_date, goods_id, warehouse_id, quality_type)
     DO UPDATE SET available_base_quantity = EXCLUDED.available_base_quantity,
                   base_cost_price = EXCLUDED.base_cost_price`,
    [today]
  );

  const count = result.rowCount ?? 0;
  if (count > 0) {
    log.info(`库存快照 v2: ${today}, ${count} 条记录`);
  }
  return count;
}
