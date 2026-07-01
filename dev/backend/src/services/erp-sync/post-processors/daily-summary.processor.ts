/**
 * 每日汇总后置处理器
 * 从本地表聚合计算每日汇总数据
 * @module services/erp-sync/post-processors/daily-summary
 */

import { createLogger } from '../../../utils/logger';
import { appQuery } from '../../../db/appPool';
import { beijingDate } from '../../../utils/beijingTime';

const log = createLogger('DailySummaryProcessor');

/**
 * 生成欠款每日汇总（按客户聚合）
 * 写入 erp_debt_daily_summary 表
 */
export async function processDebtDailySummary(): Promise<number> {
  const today = beijingDate();

  // 从 erp_debts 按客户聚合
  const result = await appQuery(
    `INSERT INTO erp_debt_daily_summary (snapshot_date, consumer_name, total_debt, bill_count, max_overdue_days)
     SELECT $1::date, consumer_name, SUM(left_amount), COUNT(*), 0
     FROM erp_debts
     WHERE left_amount > 0
     GROUP BY consumer_name
     ON CONFLICT (snapshot_date, consumer_name)
     DO UPDATE SET total_debt = EXCLUDED.total_debt, bill_count = EXCLUDED.bill_count`,
    [today]
  );

  const count = result.rowCount ?? 0;
  if (count > 0) {
    log.info(`欠款每日汇总: ${today}, ${count} 个客户`);
  }
  return count;
}

/**
 * 生成销售每日汇总（按商品聚合）
 * 写入 erp_daily_sales_summary 表
 */
export async function processSalesDailySummary(): Promise<number> {
  // 从 erp_sales_details 按日期+商品聚合
  const result = await appQuery(
    `INSERT INTO erp_daily_sales_summary (sale_date, goods_name, goods_id, total_quantity, total_amount, last_settle_time, category_name, brand_name)
     SELECT settle_time::date, goods_name, goods_id,
            SUM(base_quantity), SUM(finance_sales_amount::numeric),
            MAX(settle_time), MAX(category_name), MAX(brand_name)
     FROM erp_sales_details
     WHERE settle_time IS NOT NULL
     GROUP BY settle_time::date, goods_name, goods_id
     ON CONFLICT (sale_date, goods_name)
     DO UPDATE SET total_quantity = EXCLUDED.total_quantity,
                   total_amount = EXCLUDED.total_amount,
                   last_settle_time = EXCLUDED.last_settle_time`
  );

  const count = result.rowCount ?? 0;
  if (count > 0) {
    log.info(`销售每日汇总: ${count} 条记录`);
  }
  return count;
}
