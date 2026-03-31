/**
 * 退货考核 API 服务
 */

import request from './request';
import type {
  PenaltyRecord,
  PenaltyQueryParams,
  PenaltyStats,
  PaginatedResult,
} from '@/types/return-penalty.d';

/**
 * 获取考核记录列表
 */
export const getReturnPenalties = (
  params?: PenaltyQueryParams
): Promise<PaginatedResult<PenaltyRecord>> => {
  return request.get<PaginatedResult<PenaltyRecord>>('/return-penalty', { params });
};

/**
 * 获取我的考核记录
 */
export const getMyReturnPenalties = (params?: {
  page?: number;
  pageSize?: number;
  status?: string;
}): Promise<PaginatedResult<PenaltyRecord>> => {
  return request.get<PaginatedResult<PenaltyRecord>>('/return-penalty/my', { params });
};

/**
 * 获取考核统计
 */
export const getReturnPenaltyStats = (): Promise<PenaltyStats> => {
  return request.get<PenaltyStats>('/return-penalty/stats');
};

/**
 * 获取单条考核详情
 */
export const getReturnPenaltyById = (id: number): Promise<PenaltyRecord> => {
  return request.get<PenaltyRecord>(`/return-penalty/${id}`);
};

/**
 * 确认考核
 */
export const confirmReturnPenalty = (id: number): Promise<PenaltyRecord> => {
  return request.post<PenaltyRecord>(`/return-penalty/${id}/confirm`);
};

/**
 * 取消考核
 */
export const cancelReturnPenalty = (
  id: number,
  reason?: string
): Promise<PenaltyRecord> => {
  return request.post<PenaltyRecord>(`/return-penalty/${id}/cancel`, { reason });
};

/**
 * 申诉考核
 */
export const appealReturnPenalty = (
  id: number,
  reason: string
): Promise<PenaltyRecord> => {
  return request.post<PenaltyRecord>(`/return-penalty/${id}/appeal`, { reason });
};
