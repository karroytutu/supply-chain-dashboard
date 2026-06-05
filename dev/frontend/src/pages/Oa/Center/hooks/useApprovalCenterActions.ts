/**
 * 流程中心 - 业务操作 Hook
 * 管理审批操作（同意/拒绝/撤回/转交）和 Modal 控制
 */
import { useState, useCallback } from 'react';
import { message } from 'antd';
import { oaApi } from '@/services/api/oa';
import { getErrorMessage } from '../../../../utils/errorUtils';
import type { ApprovalInstance } from '@/types/oa';

interface UseApprovalCenterActionsParams {
  selectedId: number | null;
  setSelectedId: (id: number | null) => void;
  currentList: ApprovalInstance[];
  reloadList: () => Promise<ApprovalInstance[]>;
  reloadStats: () => Promise<void>;
  reloadDetail: (id: number) => Promise<void>;
}

export function useApprovalCenterActions({
  selectedId,
  setSelectedId,
  currentList,
  reloadList,
  reloadStats,
  reloadDetail,
}: UseApprovalCenterActionsParams) {
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferUsers, setTransferUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [transferUserId, setTransferUserId] = useState<number | null>(null);

  /** 操作完成后自动选中下一条待处理项 */
  const selectNextPending = useCallback((newList: ApprovalInstance[], processedId: number) => {
    if (newList.length === 0) {
      setSelectedId(null);
      return;
    }
    // 找到被处理项在原列表中的位置
    const currentIndex = currentList.findIndex(item => item.id === processedId);
    // 新列表中，同位置或最后一个
    const nextIndex = Math.min(currentIndex >= 0 ? currentIndex : 0, newList.length - 1);
    setSelectedId(newList[nextIndex].id);
  }, [currentList, setSelectedId]);

  const handleApprove = async () => {
    if (!selectedId) return;
    try {
      await oaApi.approve(selectedId);
      message.success('已通过');
      const newList = await reloadList();
      reloadStats();
      selectNextPending(newList, selectedId);
    } catch (error) {
      message.error(getErrorMessage(error) || '操作失败');
    }
  };

  const handleReject = async () => {
    if (!selectedId || !rejectReason.trim()) {
      message.error('请填写拒绝原因');
      return;
    }
    try {
      await oaApi.reject(selectedId, { comment: rejectReason });
      message.success('已拒绝');
      setRejectModalVisible(false);
      setRejectReason('');
      const newList = await reloadList();
      reloadStats();
      selectNextPending(newList, selectedId);
    } catch (error) {
      message.error(getErrorMessage(error) || '操作失败');
    }
  };

  const handleWithdraw = async () => {
    if (!selectedId) return;
    try {
      await oaApi.withdraw(selectedId);
      message.success('撤回成功');
      reloadList();
      reloadStats();
    } catch (error) {
      message.error(getErrorMessage(error) || '操作失败');
    }
  };

  const openTransferModal = () => {
    setTransferModalVisible(true);
    oaApi.getTransferCandidates()
      .then((users) => setTransferUsers(users))
      .catch(() => setTransferUsers([]));
  };

  const handleTransfer = async () => {
    if (!selectedId || !transferUserId) {
      message.warning('请选择转交人员');
      return;
    }
    try {
      await oaApi.transfer(selectedId, { transferToUserId: transferUserId });
      message.success('已转交');
      setTransferModalVisible(false);
      setTransferUserId(null);
      const newList = await reloadList();
      reloadStats();
      selectNextPending(newList, selectedId);
    } catch (error) {
      message.error(getErrorMessage(error) || '操作失败');
    }
  };

  const handleUpdate = async (formData: Record<string, unknown>, comment?: string) => {
    if (!selectedId) return;
    try {
      await oaApi.updateInstance(selectedId, { formData, comment });
      message.success('数据已更新');
      reloadDetail(selectedId);
    } catch (error) {
      message.error(getErrorMessage(error) || '更新失败');
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
    handleUpdate,
  };
}
