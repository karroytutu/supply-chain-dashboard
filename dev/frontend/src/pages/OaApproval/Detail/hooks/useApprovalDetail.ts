import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import type { ApprovalDetail, ApprovalNode, ApprovalAction } from '@/types/oa-approval';
import { oaApprovalApi } from '@/services/api/oa-approval';

/** 详情加载失败类型 */
export type DetailErrorType = 'forbidden' | 'not_found' | 'server_error' | null;

interface UseApprovalDetailReturn {
  loading: boolean;
  detail: ApprovalDetail | null;
  nodes: ApprovalNode[];
  actions: ApprovalAction[];
  errorType: DetailErrorType;
  canOperate: boolean;
  canWithdraw: boolean;
  handleApprove: (comment: string) => Promise<void>;
  handleReject: (comment: string) => Promise<void>;
  handleTransfer: (userId: number, comment: string) => Promise<void>;
  handleWithdraw: () => Promise<void>;
  loadDetail: () => Promise<void>;
}

export function useApprovalDetail(id: string | undefined): UseApprovalDetailReturn {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [nodes, setNodes] = useState<ApprovalNode[]>([]);
  const [actions, setActions] = useState<ApprovalAction[]>([]);
  const [errorType, setErrorType] = useState<DetailErrorType>(null);

  // 加载详情
  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErrorType(null);
    try {
      const detailRes = await oaApprovalApi.getDetail(parseInt(id));
      const detailData = detailRes.data;
      setDetail(detailData);
      setNodes(detailData.nodes || []);
      setActions(detailData.actions || []);
    } catch (error: any) {
      if (error?.status === 403) {
        setErrorType('forbidden');
      } else if (error?.status === 404) {
        setErrorType('not_found');
      } else {
        setErrorType('server_error');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // 计算权限
  const canOperate = detail?.status === 'pending' && nodes.some(n => n.status === 'pending');
  const canWithdraw = detail?.status === 'pending';

  /** 同意审批 */
  const handleApprove = async (comment: string) => {
    if (!id) return;
    try {
      await oaApprovalApi.approve(parseInt(id), { comment });
      message.success('审批通过');
      loadDetail();
    } catch (error: any) {
      message.error(error.message || '操作失败');
      throw error;
    }
  };

  /** 驳回审批 */
  const handleReject = async (comment: string) => {
    if (!id) return;
    try {
      await oaApprovalApi.reject(parseInt(id), { comment });
      message.success('已驳回');
      loadDetail();
    } catch (error: any) {
      message.error(error.message || '操作失败');
      throw error;
    }
  };

  /** 转交审批 */
  const handleTransfer = async (userId: number, comment: string) => {
    if (!id) return;
    try {
      await oaApprovalApi.transfer(parseInt(id), { transferToUserId: userId, comment });
      message.success('已转交');
      loadDetail();
    } catch (error: any) {
      message.error(error.message || '操作失败');
      throw error;
    }
  };

  /** 撤回审批 */
  const handleWithdraw = async () => {
    if (!id) return;
    try {
      await oaApprovalApi.withdraw(parseInt(id));
      message.success('已撤回');
      loadDetail();
    } catch (error: any) {
      message.error(error.message || '撤回失败');
    }
  };

  return {
    loading,
    detail,
    nodes,
    actions,
    errorType,
    canOperate,
    canWithdraw,
    handleApprove,
    handleReject,
    handleTransfer,
    handleWithdraw,
    loadDetail,
  };
}
