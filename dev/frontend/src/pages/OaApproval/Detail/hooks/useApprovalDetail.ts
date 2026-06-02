import { useApprovalDetailData } from './useApprovalDetailData';
import { useApprovalActions } from './useApprovalActions';

export type { DetailErrorType } from './useApprovalDetailData';

/**
 * 审批详情页面 Hook - 组合入口
 * 数据加载 → useApprovalDetailData
 * 操作处理 → useApprovalActions
 */
export function useApprovalDetail(id: string | undefined) {
  const data = useApprovalDetailData(id);
  const actions = useApprovalActions(id, data.detail, data.nodes, data.loadDetail);

  return { ...data, ...actions };
}
