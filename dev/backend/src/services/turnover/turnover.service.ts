/**
 * 库存周转天数服务模块
 * 使用"近2月商品库存成本汇总"表计算
 * 库存周转天数 = 平均库存金额 / 日均出库成本金额
 */

import { query } from '../../db/pool';
import {
  STANDARD_CALC_DAYS,
  TURNOVER_EXCELLENT_DAYS,
  TURNOVER_GOOD_DAYS,
  TURNOVER_ATTENTION_DAYS,
  OVERSTOCK_MILD_DAYS,
  OVERSTOCK_MODERATE_DAYS,
  OVERSTOCK_SERIOUS_DAYS,
  getTurnoverHealthStatus,
} from '../../utils/constants';
import type {
  TurnoverData,
  CategoryMetric,
  TurnoverWarningStats,
  TrendDirection,
} from './turnover.types';

/**
 * 获取库存周转天数数据
 */
export async function getTurnoverData(): Promise<TurnoverData> {
  // 获取本月和上月的数据月份
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth() + 1;
  const currentMonth = `${currentYear}-${String(currentMonthIndex).padStart(2, '0')}`;
  
  const prevMonthIndex = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear = now.getMonth() === 0 ? currentYear - 1 : currentYear;
  const prevMonth = `${prevYear}-${String(prevMonthIndex).padStart(2, '0')}`;

  // 计算本月周转天数
  const currentResult = await query<{
    turnover_days: number;
  }>(`
    SELECT 
      CASE 
        WHEN SUM(CAST(REPLACE("stockOutCostAmount", ',', '') AS NUMERIC)) > 0 
        THEN (SUM(CAST(REPLACE("beginCostAmount", ',', '') AS NUMERIC)) + SUM(CAST(REPLACE("endCostAmount", ',', '') AS NUMERIC))) / 2 
             / (SUM(CAST(REPLACE("stockOutCostAmount", ',', '') AS NUMERIC)) / $2)
        ELSE NULL 
      END as turnover_days
    FROM "近2月商品库存成本汇总"
    WHERE "数据月份" = $1
  `, [currentMonth, STANDARD_CALC_DAYS]);

  // 计算上月周转天数
  const prevResult = await query<{
    turnover_days: number;
  }>(`
    SELECT 
      CASE 
        WHEN SUM(CAST(REPLACE("stockOutCostAmount", ',', '') AS NUMERIC)) > 0 
        THEN (SUM(CAST(REPLACE("beginCostAmount", ',', '') AS NUMERIC)) + SUM(CAST(REPLACE("endCostAmount", ',', '') AS NUMERIC))) / 2 
             / (SUM(CAST(REPLACE("stockOutCostAmount", ',', '') AS NUMERIC)) / $2)
        ELSE NULL 
      END as turnover_days
    FROM "近2月商品库存成本汇总"
    WHERE "数据月份" = $1
  `, [prevMonth, STANDARD_CALC_DAYS]);

  const currentTurnover = parseFloat(currentResult.rows[0].turnover_days as any) || 0;
  const prevTurnover = parseFloat(prevResult.rows[0].turnover_days as any) || 0;

  // 计算环比
  let trend = 0;
  let trendDirection: TrendDirection = 'flat';
  if (prevTurnover > 0 && currentTurnover > 0) {
    trend = Math.round(((currentTurnover - prevTurnover) / prevTurnover) * 1000) / 10;
    if (trend > 0) trendDirection = 'up';
    else if (trend < 0) trendDirection = 'down';
  }

  // 获取健康状态
  const healthStatus = getTurnoverHealthStatus(currentTurnover);

  // 计算库存积压预警统计
  const warningStats = await getTurnoverWarningStats();

  // 获取品类周转数据
  const categories = await getCategoryTurnoverMetrics(currentMonth, prevMonth);

  return {
    value: Math.round(currentTurnover),
    unit: 'day',
    trend,
    trendDirection,
    healthStatus,
    categories: categories.slice(0, 10),
    warningStats,
    previousValue: Math.round(prevTurnover),
    period: {
      current: currentMonth,
      previous: prevMonth,
    },
  };
}

/**
 * 获取周转预警统计
 */
async function getTurnoverWarningStats(): Promise<TurnoverWarningStats> {
  const warningResult = await query<{
    mild_overstock: number;
    moderate_overstock: number;
    serious_overstock: number;
  }>(`
    WITH daily_sales AS (
      SELECT "goodsName", SUM("baseQuantity") / ${STANDARD_CALC_DAYS}.0 as avg_daily
      FROM "销售结算明细表"
      WHERE "settleTime" >= NOW() - INTERVAL '${STANDARD_CALC_DAYS} days'
      GROUP BY "goodsName"
    ),
    stock_summary AS (
      SELECT "goodsId", "goodsName", SUM("availableBaseQuantity") as total_quantity
      FROM "实时库存表"
      GROUP BY "goodsId", "goodsName"
    )
    SELECT
      COUNT(CASE WHEN sellable_days > ${OVERSTOCK_MILD_DAYS} AND sellable_days <= ${OVERSTOCK_MODERATE_DAYS} THEN 1 END) as mild_overstock,
      COUNT(CASE WHEN sellable_days > ${OVERSTOCK_MODERATE_DAYS} AND sellable_days <= ${OVERSTOCK_SERIOUS_DAYS} THEN 1 END) as moderate_overstock,
      COUNT(CASE WHEN sellable_days > ${OVERSTOCK_SERIOUS_DAYS} THEN 1 END) as serious_overstock
    FROM (
      SELECT 
        r."goodsId",
        r.total_quantity / NULLIF(s.avg_daily, 0) as sellable_days
      FROM stock_summary r
      JOIN "商品档案" g ON r."goodsId" = g."goodsId"
      LEFT JOIN daily_sales s ON r."goodsName" = s."goodsName"
      WHERE g."state" = 0
        AND r.total_quantity > 0
        AND s.avg_daily IS NOT NULL
        AND s.avg_daily > 0
    ) t
    WHERE sellable_days IS NOT NULL
  `);

  const warningData = warningResult.rows[0];
  return {
    mildOverstock: parseInt(warningData.mild_overstock as any) || 0,
    moderateOverstock: parseInt(warningData.moderate_overstock as any) || 0,
    seriousOverstock: parseInt(warningData.serious_overstock as any) || 0,
  };
}

/**
 * 获取品类周转指标
 */
async function getCategoryTurnoverMetrics(currentMonth: string, prevMonth: string): Promise<CategoryMetric[]> {
  const categoryResult = await query<{
    category_name: string;
    turnover_days: number;
    product_count: number;
    prev_turnover_days: number;
  }>(`
    WITH current_data AS (
      SELECT
        g."categoryId",
        SPLIT_PART(g."categoryChainName", '/', 1) as category_name,
        SUM(CAST(REPLACE(s."beginCostAmount", ',', '') AS NUMERIC)) as begin_amount,
        SUM(CAST(REPLACE(s."endCostAmount", ',', '') AS NUMERIC)) as end_amount,
        SUM(CAST(REPLACE(s."stockOutCostAmount", ',', '') AS NUMERIC)) as out_amount
      FROM "近2月商品库存成本汇总" s
      JOIN "商品档案" g ON CAST(s."goodsId" AS VARCHAR) = CAST(g."goodsId" AS VARCHAR)
      WHERE s."数据月份" = $1 AND g."state" = 0
      GROUP BY g."categoryId", SPLIT_PART(g."categoryChainName", '/', 1)
    ),
    prev_data AS (
      SELECT
        g."categoryId",
        SUM(CAST(REPLACE(s."beginCostAmount", ',', '') AS NUMERIC)) as begin_amount,
        SUM(CAST(REPLACE(s."endCostAmount", ',', '') AS NUMERIC)) as end_amount,
        SUM(CAST(REPLACE(s."stockOutCostAmount", ',', '') AS NUMERIC)) as out_amount
      FROM "近2月商品库存成本汇总" s
      JOIN "商品档案" g ON CAST(s."goodsId" AS VARCHAR) = CAST(g."goodsId" AS VARCHAR)
      WHERE s."数据月份" = $2 AND g."state" = 0
      GROUP BY g."categoryId"
    )
    SELECT 
      c.category_name,
      SUM(c.product_count) as product_count,
      CASE 
        WHEN SUM(c.out_amount) > 0 
        THEN (SUM(c.begin_amount) + SUM(c.end_amount)) / 2 / (SUM(c.out_amount) / $3)
        ELSE NULL 
      END as turnover_days,
      CASE 
        WHEN SUM(p.out_amount) > 0 
        THEN (SUM(p.begin_amount) + SUM(p.end_amount)) / 2 / (SUM(p.out_amount) / $3)
        ELSE NULL 
      END as prev_turnover_days
    FROM (
      SELECT
        "categoryId",
        category_name,
        COUNT(*) as product_count,
        begin_amount,
        end_amount,
        out_amount
      FROM current_data
      WHERE category_name IS NOT NULL
      GROUP BY "categoryId", category_name, begin_amount, end_amount, out_amount
    ) c
    LEFT JOIN (
      SELECT
        "categoryId",
        begin_amount,
        end_amount,
        out_amount
      FROM prev_data
    ) p ON c."categoryId" = p."categoryId"
    GROUP BY c.category_name
    ORDER BY turnover_days
  `, [currentMonth, prevMonth, STANDARD_CALC_DAYS]);

  return categoryResult.rows.map((row, index) => {
    const avgDays = parseFloat(row.turnover_days as any) || 0;
    const prevDaysValue = parseFloat(row.prev_turnover_days as any) || 0;
    let catTrend = 0;
    let catTrendDirection: TrendDirection = 'flat';
    if (prevDaysValue > 0 && avgDays > 0) {
      catTrend = Math.round(((avgDays - prevDaysValue) / prevDaysValue) * 1000) / 10;
      if (catTrend > 0) catTrendDirection = 'up';
      else if (catTrend < 0) catTrendDirection = 'down';
    }
    return {
      categoryId: `C${String(index + 1).padStart(3, '0')}`,
      categoryName: row.category_name || '未分类',
      value: Math.round(avgDays),
      trend: catTrend,
      trendDirection: catTrendDirection,
      productCount: parseInt(row.product_count as any),
    };
  });
}
