/**
 * 应收看板 API 服务
 */
import request from './request';

/** 看板主数据（KPI + 管道 + 营销师 + 明细表） */
export function getArDashboardOverview(): Promise<ArDashboardData> {
  return request.get<ArDashboardData>('/ar-dashboard/overview');
}

/** 即将逾期客户弹窗数据 */
export function getUpcomingExpiryCustomers(): Promise<UpcomingExpiryCustomer[]> {
  return request.get<UpcomingExpiryCustomer[]>('/ar-dashboard/upcoming-expiry');
}

/** 管道节点即将逾期弹窗数据 */
export function getPipelineExpiryDetails(
  status: string,
  escalationLevel?: number
): Promise<PipelineExpiryDetail[]> {
  const params: Record<string, unknown> = { status };
  if (escalationLevel !== undefined) params.escalationLevel = escalationLevel;
  return request.get<PipelineExpiryDetail[]>('/ar-dashboard/pipeline-expiry', { params });
}
