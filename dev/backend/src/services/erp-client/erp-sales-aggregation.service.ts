/**
 * ERP 销售明细本地表聚合查询
 * 对 erp_sales_details 表执行聚合查询，供目标管理概览服务使用
 */

import { appQuery } from '../../db/appPool';

/**
 * 查询毛利率（按客户+商品聚合）
 * 用于概览服务计算预计毛利
 */
export async function getMarginRatesByConsumerGoods(
  start: string, end: string, businessAttrs: readonly string[]
): Promise<Array<{ consumer_id: number; goods_id: number; total_amount: string; total_cost: string }>> {
  const result = await appQuery(
    `SELECT consumer_id, goods_id,
            SUM(finance_sales_amount::numeric) AS total_amount,
            SUM(finance_cost_amount::numeric) AS total_cost
     FROM erp_sales_details
     WHERE settle_time >= $1 AND settle_time < $2 AND business_attr = ANY($3)
     GROUP BY consumer_id, goods_id`,
    [start, end, businessAttrs]
  );
  return result.rows;
}

/**
 * 查询客户级销售聚合
 * 用于概览服务计算上月实际数据
 */
export async function getConsumerAggregation(
  start: string, end: string, businessAttrs: readonly string[]
): Promise<Array<{ consumer_id: number; total_amount: string; total_cost: string; goods_ids: number[]; categories: string[] }>> {
  const result = await appQuery(
    `SELECT consumer_id,
            SUM(finance_sales_amount::numeric) AS total_amount,
            SUM(finance_cost_amount::numeric) AS total_cost,
            ARRAY_AGG(DISTINCT goods_id) AS goods_ids,
            ARRAY_AGG(DISTINCT category_name) FILTER (WHERE category_name IS NOT NULL) AS categories
     FROM erp_sales_details
     WHERE settle_time >= $1 AND settle_time < $2 AND business_attr = ANY($3)
     GROUP BY consumer_id`,
    [start, end, businessAttrs]
  );
  return result.rows;
}
