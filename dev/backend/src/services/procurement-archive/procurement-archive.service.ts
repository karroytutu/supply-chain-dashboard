/**
 * 采购绩效月度存档服务
 * 负责战略商品齐全率和库存周转天数的月度存档
 */

import { query } from '../../db/pool';
import { appQuery } from '../../db/appPool';
import { STANDARD_CALC_DAYS } from '../../utils/constants';
import type {
  MonthlyArchiveRecord,
  ArchiveQueryParams,
  MonthlyArchiveResponse,
  MonthlyAvailabilityResult,
  MonthlyTurnoverResult,
} from './procurement-archive.types';

/**
 * 获取上月末日期
 * 示例：今天是 2026-03-30，返回 2026-02-28
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
 * 获取指定月份的月份第一天
 * @param date 月份中的任意日期
 */
export function getMonthFirstDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * 计算指定月份的战略商品齐全率数据
 * 复用 getStrategicMonthlyAvailability 的逻辑
 * @param year 年份
 * @param month 月份 (1-12)
 */
export async function calculateMonthlyAvailability(
  year: number,
  month: number
): Promise<MonthlyAvailabilityResult | null> {
  // 从 xly_dashboard 获取已确认的战略商品
  const strategicGoodsResult = await appQuery<{ goods_name: string }>(`
    SELECT goods_name
    FROM strategic_products
    WHERE status = 'confirmed' AND confirmed_at IS NOT NULL
  `);

  if (strategicGoodsResult.rows.length === 0) {
    return null;
  }

  const strategicGoodsNames = strategicGoodsResult.rows.map(r => r.goods_name);
  const totalStrategic = strategicGoodsNames.length;

  // 计算指定月份的月初和月末日期
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // 当月第0天 = 上月最后一天
  const monthStartStr = monthStart.toISOString().split('T')[0];
  const monthEndStr = monthEnd.toISOString().split('T')[0];

  // 查询该月每日战略商品库存状态
  const dailyStockResult = await query<{
    stock_date: Date;
    in_stock_count: number;
  }>(`
    SELECT
      "数据日期"::date as stock_date,
      COUNT(DISTINCT "goodsName") as in_stock_count
    FROM "实时库存表_每天"
    WHERE "goodsName" = ANY($1)
      AND "availableBaseQuantity" > 0
      AND "数据日期" >= $2
      AND "数据日期" <= $3
    GROUP BY "数据日期"::date
    ORDER BY stock_date
  `, [strategicGoodsNames, monthStartStr, monthEndStr]);

  // 计算月度平均齐全率
  const daysInMonth = dailyStockResult.rows.length;

  if (daysInMonth === 0) {
    return {
      rate: 0,
      totalSku: totalStrategic,
      daysInMonth: 0,
    };
  }

  let totalRate = 0;
  for (const row of dailyStockResult.rows) {
    const inStockCount = parseInt(row.in_stock_count as any) || 0;
    const rate = (inStockCount / totalStrategic) * 100;
    totalRate += rate;
  }

  const avgRate = Math.round((totalRate / daysInMonth) * 10) / 10;

  return {
    rate: avgRate,
    totalSku: totalStrategic,
    daysInMonth,
  };
}

/**
 * 计算指定月份的库存周转天数数据
 * 复用 getTurnoverData 的逻辑
 * @param year 年份
 * @param month 月份 (1-12)
 */
export async function calculateMonthlyTurnover(
  year: number,
  month: number
): Promise<MonthlyTurnoverResult | null> {
  const currentMonth = `${year}-${String(month).padStart(2, '0')}`;

  // 计算上月
  const prevMonthIndex = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = `${prevYear}-${String(prevMonthIndex).padStart(2, '0')}`;

  // 查询本月周转天数
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

  // 查询上月周转天数
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

  const currentTurnover = parseFloat(currentResult.rows[0]?.turnover_days as any) || 0;
  const prevTurnover = parseFloat(prevResult.rows[0]?.turnover_days as any) || 0;

  // 计算环比
  let trend = 0;
  if (prevTurnover > 0 && currentTurnover > 0) {
    trend = Math.round(((currentTurnover - prevTurnover) / prevTurnover) * 1000) / 10;
  }

  return {
    days: Math.round(currentTurnover),
    previousDays: Math.round(prevTurnover),
    trend,
  };
}

/**
 * 保存月度存档快照
 * 使用 INSERT ON CONFLICT 确保每月只有一条记录
 * @param archiveMonth 存档月份（月份第一天）
 * @param archivedBy 存档方式
 */
export async function saveMonthlyArchive(
  archiveMonth: Date,
  archivedBy: string = 'scheduler'
): Promise<void> {
  const year = archiveMonth.getFullYear();
  const month = archiveMonth.getMonth() + 1;
  const monthFirstDay = getMonthFirstDay(archiveMonth);
  const monthFirstDayStr = monthFirstDay.toISOString().split('T')[0];

  console.log(`[ProcurementArchive] 开始存档 ${year}-${month} 数据...`);

  // 计算齐全率数据
  const availabilityData = await calculateMonthlyAvailability(year, month);

  // 计算周转天数数据
  const turnoverData = await calculateMonthlyTurnover(year, month);

  // 保存到数据库
  const sql = `
    INSERT INTO procurement_monthly_archive (
      archive_month,
      strategic_availability_rate,
      strategic_total_sku,
      strategic_days_in_month,
      turnover_days,
      turnover_previous_days,
      turnover_trend,
      archived_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (archive_month) DO UPDATE SET
      strategic_availability_rate = EXCLUDED.strategic_availability_rate,
      strategic_total_sku = EXCLUDED.strategic_total_sku,
      strategic_days_in_month = EXCLUDED.strategic_days_in_month,
      turnover_days = EXCLUDED.turnover_days,
      turnover_previous_days = EXCLUDED.turnover_previous_days,
      turnover_trend = EXCLUDED.turnover_trend,
      archived_at = NOW(),
      archived_by = EXCLUDED.archived_by
  `;

  await appQuery(sql, [
    monthFirstDayStr,
    availabilityData?.rate ?? null,
    availabilityData?.totalSku ?? null,
    availabilityData?.daysInMonth ?? null,
    turnoverData?.days ?? null,
    turnoverData?.previousDays ?? null,
    turnoverData?.trend ?? null,
    archivedBy,
  ]);

  console.log(`[ProcurementArchive] ${year}-${month} 存档完成:`, {
    availabilityRate: availabilityData?.rate,
    turnoverDays: turnoverData?.days,
  });
}

/**
 * 获取月度存档列表
 */
export async function getMonthlyArchiveList(
  params: ArchiveQueryParams
): Promise<MonthlyArchiveResponse> {
  const { page = 1, pageSize = 12, startMonth, endMonth } = params;
  const offset = (page - 1) * pageSize;

  // 构建查询条件
  const conditions: string[] = [];
  const queryParams: (string | number)[] = [];
  let paramIndex = 1;

  if (startMonth) {
    conditions.push(`archive_month >= $${paramIndex}`);
    queryParams.push(startMonth);
    paramIndex++;
  }

  if (endMonth) {
    conditions.push(`archive_month <= $${paramIndex}`);
    queryParams.push(endMonth);
    paramIndex++;
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // 查询总数
  const countSql = `
    SELECT COUNT(*) as total
    FROM procurement_monthly_archive
    ${whereClause}
  `;
  const countResult = await appQuery<{ total: string }>(countSql, queryParams);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);
  const totalPages = Math.ceil(total / pageSize);

  // 查询数据
  const dataSql = `
    SELECT
      id,
      archive_month,
      strategic_availability_rate,
      strategic_total_sku,
      strategic_days_in_month,
      turnover_days,
      turnover_previous_days,
      turnover_trend,
      archived_at,
      archived_by
    FROM procurement_monthly_archive
    ${whereClause}
    ORDER BY archive_month DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const dataResult = await appQuery(dataSql, [...queryParams, pageSize, offset]);

  const records: MonthlyArchiveRecord[] = dataResult.rows.map(row => ({
    id: row.id,
    archiveMonth: row.archive_month instanceof Date
      ? row.archive_month.toISOString().split('T')[0]
      : String(row.archive_month),
    strategicAvailabilityRate: row.strategic_availability_rate !== null
      ? parseFloat(row.strategic_availability_rate)
      : null,
    strategicTotalSku: row.strategic_total_sku !== null
      ? parseInt(row.strategic_total_sku, 10)
      : null,
    strategicDaysInMonth: row.strategic_days_in_month !== null
      ? parseInt(row.strategic_days_in_month, 10)
      : null,
    turnoverDays: row.turnover_days !== null
      ? parseInt(row.turnover_days, 10)
      : null,
    turnoverPreviousDays: row.turnover_previous_days !== null
      ? parseInt(row.turnover_previous_days, 10)
      : null,
    turnoverTrend: row.turnover_trend !== null
      ? parseFloat(row.turnover_trend)
      : null,
    archivedAt: row.archived_at,
    archivedBy: row.archived_by || 'scheduler',
  }));

  return {
    records,
    total,
    page,
    pageSize,
    totalPages,
  };
}
