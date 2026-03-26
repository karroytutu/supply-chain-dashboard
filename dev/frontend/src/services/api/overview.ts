/**
 * 数据总览 API 服务
 */

import request from './request';
import type { OverviewStats, TrendData } from '@/types/overview';

/**
 * 获取全局统计数据
 */
export function getOverviewStats(): Promise<OverviewStats> {
  return request.get<OverviewStats>('/overview/stats');
}

/**
 * 获取趋势数据
 * @param days 天数，默认7天
 */
export function getTrendData(days = 7): Promise<TrendData> {
  return request.get<TrendData>('/overview/trend', { params: { days } });
}
