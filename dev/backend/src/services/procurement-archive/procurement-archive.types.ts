/**
 * 采购绩效月度存档类型定义
 */

/** 月度存档记录 */
export interface MonthlyArchiveRecord {
  id: number;
  archiveMonth: string;           // YYYY-MM-DD (月份第一天)
  strategicAvailabilityRate: number | null;
  strategicTotalSku: number | null;
  strategicDaysInMonth: number | null;
  turnoverDays: number | null;
  turnoverPreviousDays: number | null;
  turnoverTrend: number | null;
  archivedAt: Date;
  archivedBy: string;
}

/** 存档数据输入 */
export interface ArchiveInput {
  strategicAvailabilityRate?: number;
  strategicTotalSku?: number;
  strategicDaysInMonth?: number;
  turnoverDays?: number;
  turnoverPreviousDays?: number;
  turnoverTrend?: number;
}

/** 查询参数 */
export interface ArchiveQueryParams {
  page?: number;
  pageSize?: number;
  startMonth?: string;
  endMonth?: string;
}

/** API 响应 */
export interface MonthlyArchiveResponse {
  records: MonthlyArchiveRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 月度齐全率计算结果 */
export interface MonthlyAvailabilityResult {
  rate: number;
  totalSku: number;
  daysInMonth: number;
}

/** 月度周转天数计算结果 */
export interface MonthlyTurnoverResult {
  days: number;
  previousDays: number;
  trend: number;
}
