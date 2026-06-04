import { useState } from 'react';
import { message } from 'antd';
import type { ApprovalDetail, ApprovalNode } from '@/types/oa';
import { oaApi } from '@/services/api/oa';
import { usePermission } from '@/hooks/usePermission';

type ActionType = 'approve' | 'reject' | 'transfer' | 'countersign' | null;

export interface ApprovalActions {
  actionLoading: boolean;
  actionModalVisible: boolean;
  actionType: ActionType;
  actionComment: string;
  transferUserId: number | null;
  transferUsers: Array<{ id: number; name: string }>;
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

export function useApprovalActions(
  id: string | undefined,
  detail: ApprovalDetail | null,
  nodes: ApprovalNode[],
  loadDetail: () => Promise<void>,
): ApprovalActions {
  const { currentUser } = usePermission();
  const [actionLoading, setActionLoading] = useState(false);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [actionComment, setActionComment] = useState('');
  const [transferUserId, setTransferUserId] = useState<number | null>(null);
  const [transferUsers, setTransferUsers] = useState<Array<{ id: number; name: string }>>([]);

  const handleAction = async () => {
    if (!id || !actionType) return;

    if (actionType === 'transfer' && !transferUserId) {
      message.warning('请选择转交人员');
      return;
    }

    setActionLoading(true);
    try {
      switch (actionType) {
        case 'approve': {
          const approveRes = await oaApi.approve(parseInt(id), { comment: actionComment }) as any;
          if (approveRes?.data?.status === 'processing') {
            message.success('审批已通过，系统处理中');
          } else {
            message.success('已通过');
          }
          break;
        }
        case 'reject':
          await oaApi.reject(parseInt(id), { comment: actionComment });
          message.success('已驳回');
          break;
        case 'transfer':
          if (transferUserId) await oaApi.transfer(parseInt(id), { transferToUserId: transferUserId, comment: actionComment });
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

  const handleWithdraw = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await oaApi.withdraw(parseInt(id));
      message.success('已撤回');
      loadDetail();
    } catch (error) {
      message.error('撤回失败');
    } finally {
      setActionLoading(false);
    }
  };

  const openActionModal = (type: 'approve' | 'reject' | 'transfer' | 'countersign') => {
    setActionType(type);
    setActionModalVisible(true);
    if (type === 'transfer') {
      oaApi.getTransferCandidates()
        .then((users) => setTransferUsers(users))
        .catch(() => setTransferUsers([]));
    }
  };

  const canOperate = () => {
    if (!detail || detail.status !== 'pending') return false;
    const currentNode = nodes.find((n) => n.status === 'pending');
    if (!currentNode) return false;
    if (currentNode.assignedUserId !== currentUser?.id) return false;
    return true;
  };

  const canWithdraw = () => {
    if (!detail || detail.status !== 'pending') return false;
    if (detail.applicantId !== currentUser?.id) return false;
    return true;
  };

  const getCurrentStep = () => {
    const pendingIndex = nodes.findIndex((n) => n.status === 'pending');
    if (pendingIndex === -1) {
      if (detail?.status === 'approved') return nodes.length;
      if (detail?.status === 'rejected') return 0;
    }
    return pendingIndex;
  };

  return {
    actionLoading, actionModalVisible, actionType, actionComment,
    transferUserId, transferUsers,
    setActionModalVisible, setActionComment, setTransferUserId,
    openActionModal, handleAction, handleWithdraw,
    canOperate, canWithdraw, getCurrentStep,
  };
}
