/**
 * 审批中心 - 业务操作 Hook
 * 管理审批操作（同意/拒绝/撤回/转交）和 Modal 控制
 */
import { useState } from 'react';
import { message } from 'antd';
import { oaApprovalApi } from '@/services/api/oa-approval';

interface UseApprovalCenterActionsParams {
  selectedId: number | null;
  reloadList: () => Promise<void>;
  reloadStats: () => Promise<void>;
  reloadDetail: (id: number) => Promise<void>;
}

export function useApprovalCenterActions({
  selectedId,
  reloadList,
  reloadStats,
  reloadDetail,
}: UseApprovalCenterActionsParams) {
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferUsers, setTransferUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [transferUserId, setTransferUserId] = useState<number | null>(null);

  const handleApprove = async () => {
    if (!selectedId) return;
    try {
      await oaApprovalApi.approve(selectedId);
      message.success('审批通过');
      reloadList();
      reloadStats();
      reloadDetail(selectedId);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const handleReject = async () => {
    if (!selectedId || !rejectReason.trim()) {
      message.error('请填写拒绝原因');
      return;
    }
    try {
      await oaApprovalApi.reject(selectedId, { comment: rejectReason });
      message.success('已拒绝');
      setRejectModalVisible(false);
      setRejectReason('');
      reloadList();
      reloadStats();
      reloadDetail(selectedId);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const handleWithdraw = async () => {
    if (!selectedId) return;
    try {
      await oaApprovalApi.withdraw(selectedId);
      message.success('撤回成功');
      reloadList();
      reloadStats();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const openTransferModal = () => {
    setTransferModalVisible(true);
    oaApprovalApi.getTransferCandidates()
      .then((users) => setTransferUsers(users))
      .catch(() => setTransferUsers([]));
  };

  const handleTransfer = async () => {
    if (!selectedId || !transferUserId) {
      message.warning('请选择转交人员');
      return;
    }
    try {
      await oaApprovalApi.transfer(selectedId, { transferToUserId: transferUserId });
      message.success('已转交');
      setTransferModalVisible(false);
      setTransferUserId(null);
      reloadList();
      reloadStats();
      if (selectedId) reloadDetail(selectedId);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  return {
    reject: {
      visible: rejectModalVisible,
      reason: rejectReason,
      setVisible: setRejectModalVisible,
      setReason: setRejectReason,
    },
    transfer: {
      visible: transferModalVisible,
      users: transferUsers,
      userId: transferUserId,
      setVisible: setTransferModalVisible,
      setUserId: setTransferUserId,
    },
    handleApprove,
    handleReject,
    handleWithdraw,
    openTransferModal,
    handleTransfer,
  };
}
