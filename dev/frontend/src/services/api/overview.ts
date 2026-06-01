/**
 * 数据总览 API 服务
 */

import request from './request';
import type { OverviewFull, OverviewStats, TrendData } from '@/types/overview';

/**
 * 获取完整概览数据（stats + trend，推荐使用）
 * 后端先计算 stats 填充缓存，再计算 trend，避免重复调用
 */
export function getOverviewFull(): Promise<OverviewFull> {
  return request.get<OverviewFull>('/overview/full', { timeout: 60000 });
}

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
