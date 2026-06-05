/**
 * OA 审批操作共享 Hook
 * 统一管理审批操作（同意/驳回/转交/更新/撤回）的 API 调用、ActionModal 状态和权限判断
 * 供 Oa/Detail 独立页面和 Oa/Center 流程中心面板共用
 */
import { useState, useMemo, useCallback } from 'react';
import { message } from 'antd';
import type { ApprovalDetail, ApprovalNode } from '@/types/oa';
import { oaApi } from '@/services/api/oa';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/utils/errorUtils';

export type ActionType = 'approve' | 'reject' | 'transfer' | 'countersign' | 'update' | null;

export interface UseApprovalActionsConfig {
  instanceId: number | undefined;
  detail: ApprovalDetail | null;
  nodes: ApprovalNode[];
  /** 审批操作（同意/驳回/转交/更新）成功后的回调 */
  onActionComplete?: () => void | Promise<void>;
  /** 撤回成功后的回调（独立于审批操作，Center 场景下只刷新不跳转） */
  onWithdrawComplete?: () => void | Promise<void>;
}

export interface UseApprovalActionsReturn {
  actionLoading: boolean;
  actionModalVisible: boolean;
  actionType: ActionType;
  actionComment: string;
  transferUsers: Array<{ id: number; name: string }>;
  openActionModal: (type: NonNullable<ActionType>) => void;
  closeActionModal: () => void;
  executeAction: () => Promise<void>;
  executeWithdraw: () => Promise<void>;
  setActionComment: (v: string) => void;
  setTransferUserId: (v: number | null) => void;
  canOperate: boolean;
  canWithdraw: boolean;
  currentStep: number;
}

export function useApprovalActions({
  instanceId,
  detail,
  nodes,
  onActionComplete,
  onWithdrawComplete,
}: UseApprovalActionsConfig): UseApprovalActionsReturn {
  const { currentUser } = usePermission();
  const [actionLoading, setActionLoading] = useState(false);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [actionComment, setActionComment] = useState('');
  const [transferUserId, setTransferUserId] = useState<number | null>(null);
  const [transferUsers, setTransferUsers] = useState<Array<{ id: number; name: string }>>([]);

  // ==================== 权限计算（useMemo）====================

  const canOperate = useMemo(() => {
    if (!detail || detail.status !== 'pending') return false;
    const currentNode = nodes.find((n) => n.status === 'pending');
    if (!currentNode) return false;
    return currentNode.assignedUserId === currentUser?.id;
  }, [detail, nodes, currentUser?.id]);

  const canWithdraw = useMemo(() => {
    if (!detail || detail.status !== 'pending') return false;
    return detail.applicantId === currentUser?.id;
  }, [detail, currentUser?.id]);

  const currentStep = useMemo(() => {
    const pendingIndex = nodes.findIndex((n) => n.status === 'pending');
    if (pendingIndex === -1) {
      if (detail?.status === 'approved') return nodes.length;
      if (detail?.status === 'rejected') return 0;
      return nodes.length; // cancelled/withdrawn/processing 等状态 fallback
    }
    return pendingIndex;
  }, [nodes, detail?.status]);

  // ==================== 操作执行 ====================

  const executeAction = useCallback(async () => {
    if (!instanceId || !actionType) return;

    if (actionType === 'transfer' && !transferUserId) {
      message.warning('请选择转交人员');
      return;
    }

    setActionLoading(true);
    try {
      switch (actionType) {
        case 'approve': {
          const res = await oaApi.approve(instanceId, { comment: actionComment }) as any;
          if (res?.data?.status === 'processing') {
            message.success('审批已通过，系统处理中');
          } else {
            message.success('已通过');
          }
          break;
        }
        case 'reject':
          if (!actionComment.trim()) {
            message.warning('请填写驳回原因');
            return;
          }
          await oaApi.reject(instanceId, { comment: actionComment });
          message.success('已驳回');
          break;
        case 'transfer':
          if (transferUserId) {
            await oaApi.transfer(instanceId, { transferToUserId: transferUserId, comment: actionComment });
          }
          message.success('已转交');
          break;
        case 'countersign':
          message.warning('加签功能需要选择加签人员');
          return; // 未执行操作，跳过状态清理和 onActionComplete
        case 'update':
          await oaApi.updateInstance(instanceId, {
            formData: detail?.formData || {},
            comment: actionComment || undefined,
          });
          message.success('数据已更新');
          break;
      }
      setActionModalVisible(false);
      setActionComment('');
      setTransferUserId(null);
      await onActionComplete?.();
    } catch (error) {
      message.error(getErrorMessage(error) || '操作失败');
    } finally {
      setActionLoading(false);
    }
  }, [instanceId, actionType, actionComment, transferUserId, detail?.formData, onActionComplete]);

  const executeWithdraw = useCallback(async () => {
    if (!instanceId) return;
    setActionLoading(true);
    try {
      await oaApi.withdraw(instanceId);
      message.success('已撤回');
      await onWithdrawComplete?.();
    } catch (error) {
      message.error(getErrorMessage(error) || '撤回失败');
    } finally {
      setActionLoading(false);
    }
  }, [instanceId, onWithdrawComplete]);

  // ==================== 弹窗控制 ====================

  const openActionModal = useCallback((type: NonNullable<ActionType>) => {
    setActionType(type);
    setActionModalVisible(true);
    setActionComment('');
    setTransferUserId(null);
    if (type === 'transfer') {
      oaApi.getTransferCandidates()
        .then((users) => setTransferUsers(users))
        .catch(() => setTransferUsers([]));
    }
  }, []);

  const closeActionModal = useCallback(() => {
    setActionModalVisible(false);
    setActionComment('');
    setTransferUserId(null);
  }, []);

  return {
    actionLoading, actionModalVisible, actionType, actionComment, transferUsers,
    openActionModal, closeActionModal, executeAction, executeWithdraw,
    setActionComment, setTransferUserId,
    canOperate, canWithdraw, currentStep,
  };
}
