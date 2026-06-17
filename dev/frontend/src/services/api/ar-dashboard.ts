/**
 * 应收看板 API 服务
 */
import request from './request';

/** 看板主数据（KPI + 管道 + 营销师 + 明细表） */
export function getArDashboardOverview(): Promise<ArDashboardData> {
  return request.get<ArDashboardData>('/ar-dashboard/overview');
}

/** 诉讼进度明细弹窗数据 */
export function getLegalProgressDetails(category: string): Promise<LegalProgressDetail[]> {
  return request.get<LegalProgressDetail[]>('/ar-dashboard/legal-progress', { params: { category } });
}

/** 管道节点超时明细弹窗数据（时限维度） */
export function getPipelineTimeoutDetails(
  status: string,
  escalationLevel?: number
): Promise<PipelineTimeoutDetail[]> {
  const params: Record<string, unknown> = { status };
  if (escalationLevel !== undefined) params.escalationLevel = escalationLevel;
  return request.get<PipelineTimeoutDetail[]>('/ar-dashboard/pipeline-timeout', { params });
}
