/**
 * 应收账款统计快照服务
 * 负责每日统计快照的生成和环比计算
 */

import { appQuery } from '../../db/appPool';

/** 每日统计快照数据结构 */
export interface ArDailyStats {
  statDate: Date;
  totalAmount: number;
  overdueAmount: number;
  overdueRate: number;
  avgAgingDays: number;
  totalCount: number;
  overdueCount: number;
}

/** API 返回的统计数据（含环比） */
export interface ArStatsResponse {
  totalAmount: number;
  overdueAmount: number;
  overdueRate: number;
  avgAgingDays: number;
  totalCount: number;
  overdueCount: number;
  totalAmountTrend: number;
  overdueAmountTrend: number;
  overdueRateTrend: number;
  avgAgingDaysTrend: number;
  hasComparison: boolean;
  comparisonDate: string | null;
}

/**
 * 计算当前统计数据
 * 从 ar_receivables 表查询最新的统计信息
 * 
 * 关键字段说明：
 * - work_time: 欠款确认日期（送达确认后产生欠款的时间），用于计算账龄
 * - due_date: 到期日（work_time + max_debt_days），用于判断逾期
 * - 账龄 = 当前日期 - work_time（欠款存在的天数）
 */
export async function calculateCurrentStats(): Promise<ArDailyStats> {
  const sql = `
    SELECT
      COALESCE(SUM(left_amount), 0) as total_amount,
      COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN left_amount ELSE 0 END), 0) as overdue_amount,
      COALESCE(
        AVG(
          CASE 
            WHEN work_time IS NOT NULL THEN CURRENT_DATE - work_time::date 
            WHEN bill_order_time IS NOT NULL THEN CURRENT_DATE - bill_order_time::date
            ELSE NULL 
          END
        ), 
        0
      ) as avg_aging_days,
      COUNT(*) as total_count,
      COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END) as overdue_count
    FROM ar_receivables
  `;

  const result = await appQuery(sql);
  const row = result.rows[0];

  const totalAmount = parseFloat(row.total_amount) || 0;
  const overdueAmount = parseFloat(row.overdue_amount) || 0;
  const overdueRate = totalAmount > 0 ? (overdueAmount / totalAmount) * 100 : 0;

  return {
    statDate: new Date(),
    totalAmount,
    overdueAmount,
    overdueRate: parseFloat(overdueRate.toFixed(2)),
    avgAgingDays: parseFloat(parseFloat(row.avg_aging_days).toFixed(2)) || 0,
    totalCount: parseInt(row.total_count, 10) || 0,
    overdueCount: parseInt(row.overdue_count, 10) || 0,
  };
}

/**
 * 保存每日统计快照
 * 使用 INSERT ON CONFLICT 确保每天只有一条记录
 */
export async function saveDailySnapshot(): Promise<void> {
  const stats = await calculateCurrentStats();
  const today = new Date().toISOString().split('T')[0];

  const sql = `
    INSERT INTO ar_daily_stats (
      stat_date, total_amount, overdue_amount, overdue_rate,
      avg_aging_days, total_count, overdue_count
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (stat_date) DO UPDATE SET
      total_amount = EXCLUDED.total_amount,
      overdue_amount = EXCLUDED.overdue_amount,
      overdue_rate = EXCLUDED.overdue_rate,
      avg_aging_days = EXCLUDED.avg_aging_days,
      total_count = EXCLUDED.total_count,
      overdue_count = EXCLUDED.overdue_count
  `;

  await appQuery(sql, [
    today,
    stats.totalAmount,
    stats.overdueAmount,
    stats.overdueRate,
    stats.avgAgingDays,
    stats.totalCount,
    stats.overdueCount,
  ]);

  console.log(`[ArStats] 已保存 ${today} 的统计快照:`, {
    totalAmount: stats.totalAmount,
    overdueAmount: stats.overdueAmount,
    overdueRate: stats.overdueRate,
  });
}

/**
 * 计算上月底日期
 * 示例：今天是 2026-03-29，返回 2026-02-28
 */
export function getLastMonthEndDate(): Date {
  const now = new Date();
  // 当月第一天
  const firstDayOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  // 上月底 = 当月第一天 - 1天
  const lastMonthEnd = new Date(firstDayOfCurrentMonth.getTime() - 24 * 60 * 60 * 1000);
  return lastMonthEnd;
}

/**
 * 获取上月底的统计快照
 * 若上月底快照不存在，往前回溯最多7天查找最近的快照
 */
export async function getLastMonthEndStats(): Promise<ArDailyStats | null> {
  const lastMonthEnd = getLastMonthEndDate();
  const lastMonthEndStr = lastMonthEnd.toISOString().split('T')[0];

  // 计算回溯的最早日期（上月底往前7天）
  const earliestDate = new Date(lastMonthEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const earliestDateStr = earliestDate.toISOString().split('T')[0];

  const sql = `
    SELECT
      stat_date,
      total_amount,
      overdue_amount,
      overdue_rate,
      avg_aging_days,
      total_count,
      overdue_count
    FROM ar_daily_stats
    WHERE stat_date >= $1 AND stat_date <= $2
    ORDER BY stat_date DESC
    LIMIT 1
  `;

  const result = await appQuery(sql, [earliestDateStr, lastMonthEndStr]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    statDate: row.stat_date,
    totalAmount: parseFloat(row.total_amount) || 0,
    overdueAmount: parseFloat(row.overdue_amount) || 0,
    overdueRate: parseFloat(row.overdue_rate) || 0,
    avgAgingDays: parseFloat(row.avg_aging_days) || 0,
    totalCount: parseInt(row.total_count, 10) || 0,
    overdueCount: parseInt(row.overdue_count, 10) || 0,
  };
}

/**
 * 获取逾期前预警数据
 * @returns 逾期前5天和2天的预警数据
 */
export async function getPreWarningData(): Promise<{
  preWarn5: any[];
  preWarn2: any[];
  preWarn5Count: number;
  preWarn2Count: number;
}> {
  // 逾期前5天预警
  const preWarn5Sql = `
    SELECT
      id,
      erp_bill_id,
      order_no,
      consumer_name,
      consumer_code,
      salesman_name,
      dept_name,
      max_debt_days,
      left_amount,
      bill_order_time,
      due_date,
      ar_status,
      notification_status,
      CURRENT_DATE - bill_order_time::date as aging_days,
      5 as days_before_due
    FROM ar_receivables
    WHERE due_date::date - CURRENT_DATE = 5
      AND left_amount > 0
    ORDER BY left_amount DESC
  `;
  const preWarn5Result = await appQuery(preWarn5Sql);

  // 逾期前2天预警
  const preWarn2Sql = `
    SELECT
      id,
      erp_bill_id,
      order_no,
      consumer_name,
      consumer_code,
      salesman_name,
      dept_name,
      max_debt_days,
      left_amount,
      bill_order_time,
      due_date,
      ar_status,
      notification_status,
      CURRENT_DATE - bill_order_time::date as aging_days,
      2 as days_before_due
    FROM ar_receivables
    WHERE due_date::date - CURRENT_DATE = 2
      AND left_amount > 0
    ORDER BY left_amount DESC
  `;
  const preWarn2Result = await appQuery(preWarn2Sql);

  return {
    preWarn5: preWarn5Result.rows,
    preWarn2: preWarn2Result.rows,
    preWarn5Count: preWarn5Result.rows.length,
    preWarn2Count: preWarn2Result.rows.length,
  };
}

/**
 * 获取统计数据（含环比）
 * 主入口函数：计算本期数据并与上月底对比
 */
export async function getArStatsWithComparison(): Promise<ArStatsResponse> {
  // 获取当前统计数据
  const currentStats = await calculateCurrentStats();

  // 获取上月底快照
  const lastMonthStats = await getLastMonthEndStats();

  // 计算环比
  if (!lastMonthStats) {
    // 无历史数据
    return {
      totalAmount: currentStats.totalAmount,
      overdueAmount: currentStats.overdueAmount,
      overdueRate: currentStats.overdueRate,
      avgAgingDays: currentStats.avgAgingDays,
      totalCount: currentStats.totalCount,
      overdueCount: currentStats.overdueCount,
      totalAmountTrend: 0,
      overdueAmountTrend: 0,
      overdueRateTrend: 0,
      avgAgingDaysTrend: 0,
      hasComparison: false,
      comparisonDate: null,
    };
  }

  // 计算环比变化
  const totalAmountTrend =
    lastMonthStats.totalAmount > 0
      ? parseFloat(
          (
            ((currentStats.totalAmount - lastMonthStats.totalAmount) / lastMonthStats.totalAmount) *
            100
          ).toFixed(2)
        )
      : 0;

  const overdueAmountTrend =
    lastMonthStats.overdueAmount > 0
      ? parseFloat(
          (
            (currentStats.overdueAmount - lastMonthStats.overdueAmount) /
            lastMonthStats.overdueAmount *
            100
          ).toFixed(2)
        )
      : 0;

  const overdueRateTrend = parseFloat(
    (currentStats.overdueRate - lastMonthStats.overdueRate).toFixed(2)
  );

  const avgAgingDaysTrend = Math.round(currentStats.avgAgingDays - lastMonthStats.avgAgingDays);

  const comparisonDate = lastMonthStats.statDate instanceof Date
    ? lastMonthStats.statDate.toISOString().split('T')[0]
    : String(lastMonthStats.statDate);

  return {
    totalAmount: currentStats.totalAmount,
    overdueAmount: currentStats.overdueAmount,
    overdueRate: currentStats.overdueRate,
    avgAgingDays: Math.round(currentStats.avgAgingDays),
    totalCount: currentStats.totalCount,
    overdueCount: currentStats.overdueCount,
    totalAmountTrend: parseFloat(String(totalAmountTrend)),
    overdueAmountTrend: parseFloat(String(overdueAmountTrend)),
    overdueRateTrend,
    avgAgingDaysTrend,
    hasComparison: true,
    comparisonDate,
  };
}
