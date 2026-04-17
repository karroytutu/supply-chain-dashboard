import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import type { ApprovalDetail, ApprovalNode, ApprovalAction } from '@/types/oa-approval';
import { oaApprovalApi } from '@/services/api/oa-approval';

interface UseApprovalDetailReturn {
  loading: boolean;
  detail: ApprovalDetail | null;
  nodes: ApprovalNode[];
  actions: ApprovalAction[];
  actionLoading: boolean;
  actionModalVisible: boolean;
  actionType: 'approve' | 'reject' | 'transfer' | 'countersign' | null;
  actionComment: string;
  transferUserId: number | null;
  setActionModalVisible: (visible: boolean) => void;
  setActionComment: (comment: string) => void;
  setTransferUserId: (id: number | null) => void;
  openActionModal: (type: 'approve' | 'reject' | 'transfer' | 'countersign') => void;
  handleAction: () => Promise<void>;
  handleWithdraw: () => Promise<void>;
  canOperate: () => boolean;
  canWithdraw: () => boolean;
  getCurrentStep: () => number;
}

export function useApprovalDetail(id: string | undefined): UseApprovalDetailReturn {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [nodes, setNodes] = useState<ApprovalNode[]>([]);
  const [actions, setActions] = useState<ApprovalAction[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  // 操作弹窗
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'transfer' | 'countersign' | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [transferUserId, setTransferUserId] = useState<number | null>(null);

  // 加载详情
  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [detailRes, nodesRes, actionsRes] = await Promise.all([
        oaApprovalApi.getDetail(parseInt(id)),
        oaApprovalApi.getNodes(parseInt(id)),
        oaApprovalApi.getActions(parseInt(id)),
      ]);
      setDetail(detailRes.data);
      setNodes(nodesRes.data);
      setActions(actionsRes.data);
    } catch (error) {
      message.error('加载审批详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // 执行审批操作
  const handleAction = async () => {
    if (!id || !actionType) return;

    if (actionType === 'transfer' && !transferUserId) {
      message.warning('请选择转交人员');
      return;
    }

    setActionLoading(true);
    try {
      switch (actionType) {
        case 'approve':
          await oaApprovalApi.approve(parseInt(id), { comment: actionComment });
          message.success('审批通过');
          break;
        case 'reject':
          await oaApprovalApi.reject(parseInt(id), { comment: actionComment });
          message.success('已驳回');
          break;
        case 'transfer':
          await oaApprovalApi.transfer(parseInt(id), { transferToUserId: transferUserId!, comment: actionComment });
          message.success('已转交');
          break;
        case 'countersign':
          message.warning('加签功能需要选择加签人员');
          break;
      }
      setActionModalVisible(false);
      setActionComment('');
      setTransferUserId(null);
      loadDetail();
    } catch (error) {
      message.error('操作失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 撤回审批
  const handleWithdraw = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await oaApprovalApi.withdraw(parseInt(id));
      message.success('已撤回');
      loadDetail();
    } catch (error) {
      message.error('撤回失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 打开操作弹窗
  const openActionModal = (type: 'approve' | 'reject' | 'transfer' | 'countersign') => {
    setActionType(type);
    setActionModalVisible(true);
  };

  // 检查当前用户是否可以操作
  const canOperate = () => {
    if (!detail || detail.status !== 'pending') return false;
    const currentNode = nodes.find((n) => n.status === 'pending');
    if (!currentNode) return false;
    return true;
  };

  // 检查是否可以撤回
  const canWithdraw = () => {
    if (!detail || detail.status !== 'pending') return false;
    return true;
  };

  // 获取当前步骤索引
  const getCurrentStep = () => {
    const pendingIndex = nodes.findIndex((n) => n.status === 'pending');
    if (pendingIndex === -1) {
      if (detail?.status === 'approved') return nodes.length;
      if (detail?.status === 'rejected') return 0;
    }
    return pendingIndex;
  };

  return {
    loading,
    detail,
    nodes,
    actions,
    actionLoading,
    actionModalVisible,
    actionType,
    actionComment,
    transferUserId,
    setActionModalVisible,
    setActionComment,
    setTransferUserId,
    openActionModal,
    handleAction,
    handleWithdraw,
    canOperate,
    canWithdraw,
    getCurrentStep,
  };
}
