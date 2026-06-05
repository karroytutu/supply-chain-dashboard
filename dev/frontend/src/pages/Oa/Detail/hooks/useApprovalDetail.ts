import { useApprovalDetailData } from './useApprovalDetailData';
import { useApprovalActions } from '@/components/Oa/hooks/useApprovalActions';

export type { DetailErrorType } from './useApprovalDetailData';

/**
 * 流程详情页面 Hook - 组合入口
 * 数据加载 → useApprovalDetailData（Detail 独有，含 auto 轮询）
 * 操作处理 → useApprovalActions（共享）
 */
export function useApprovalDetail(id: string | undefined) {
  const data = useApprovalDetailData(id);
  const instanceId = id ? parseInt(id) : undefined;
  const actions = useApprovalActions({
    instanceId,
    detail: data.detail,
    nodes: data.nodes,
    onActionComplete: data.loadDetail,
  });

  return { ...data, ...actions };
}
