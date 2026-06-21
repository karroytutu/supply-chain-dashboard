/**
 * OA 审批操作共享 Hook
 * 统一管理审批操作（同意/拒绝/转交/更新/撤回）的 API 调用、ActionModal 状态和权限判断
 * 供 Oa/Detail 独立页面和 Oa/Center 流程中心面板共用
 */
import { useState, useMemo, useCallback } from 'react';
import { message } from 'antd';
import type { ApprovalDetail, ApprovalNode } from '@/types/oa';
import { oaApi } from '@/services/api/oa';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/utils/errorUtils';
import type { EditableFormSectionRef } from '../EditableFormSection';

export type ActionType = 'approve' | 'reject' | 'transfer' | 'countersign' | 'update' | 'comment' | null;

export interface UseApprovalActionsConfig {
  instanceId: number | undefined;
  detail: ApprovalDetail | null;
  nodes: ApprovalNode[];
  /** 审批操作（同意/拒绝/转交/更新）成功后的回调 */
  onActionComplete?: () => void | Promise<void>;
  /** 撤回成功后的回调（独立于审批操作，Center 场景下只刷新不跳转） */
  onWithdrawComplete?: () => void | Promise<void>;
  /** 可编辑表单 ref（操作型节点时传入，用于获取表单编辑值和校验） */
  editableFormRef?: React.RefObject<EditableFormSectionRef>;
}

export interface UseApprovalActionsReturn {
  actionLoading: boolean;
  actionModalVisible: boolean;
  actionType: ActionType;
  actionComment: string;
  transferUsers: Array<{ id: number; name: string }>;
  countersignUserIds: number[];
  countersignType: 'before' | 'after';
  openActionModal: (type: NonNullable<ActionType>) => void;
  closeActionModal: () => void;
  executeAction: () => Promise<void>;
  executeWithdraw: () => Promise<void>;
  setActionComment: (v: string) => void;
  setTransferUserId: (v: number | null) => void;
  setCountersignUserIds: (v: number[]) => void;
  setCountersignType: (v: 'before' | 'after') => void;
  canOperate: boolean;
  canWithdraw: boolean;
  canComment: boolean;
  currentStep: number;
}

export function useApprovalActions({
  instanceId,
  detail,
  nodes,
  onActionComplete,
  onWithdrawComplete,
  editableFormRef,
}: UseApprovalActionsConfig): UseApprovalActionsReturn {
  const { currentUser } = usePermission();
  const [actionLoading, setActionLoading] = useState(false);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [actionComment, setActionComment] = useState('');
  const [transferUserId, setTransferUserId] = useState<number | null>(null);
  const [transferUsers, setTransferUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [countersignUserIds, setCountersignUserIds] = useState<number[]>([]);
  const [countersignType, setCountersignType] = useState<'before' | 'after'>('after');

  // ==================== 权限计算（useMemo）====================

  const canOperate = useMemo(() => {
    if (!detail || detail.status !== 'pending') return false;
    return nodes.some(
      (n) => n.status === 'pending' && n.assignedUserId === currentUser?.id
    );
  }, [detail, nodes, currentUser?.id]);

  const canWithdraw = useMemo(() => {
    if (!detail || detail.status !== 'pending') return false;
    return detail.applicantId === currentUser?.id;
  }, [detail, currentUser?.id]);

  const canComment = useMemo(() => {
    if (!detail) return false;
    const uid = currentUser?.id;
    if (!uid) return false;
    // 参与者：任意节点分配人（含历史已审批、当前待审批、未来节点）
    if (nodes.some((n) => n.assignedUserId === uid)) return true;
    // 参与者：抄送人
    if (detail.ccUsers?.some((cc) => cc.userId === uid)) return true;
    // 参与者：申请人
    if (detail.applicantId === uid) return true;
    return false;
  }, [detail, nodes, currentUser?.id]);

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
          // 操作型节点：先校验可编辑表单必填规则
          if (editableFormRef?.current) {
            const errors = editableFormRef.current.validate();
            if (errors.length > 0) {
              message.error(errors.join('；'));
              return; // 不关闭弹窗，finally 中 setActionLoading(false)
            }
          }
          const inputData = editableFormRef?.current?.getEditedValues();
          const res = await oaApi.approve(instanceId, {
            comment: actionComment,
            inputData: inputData && Object.keys(inputData).length > 0 ? inputData : undefined,
          });
          if (res?.status === 'processing') {
            message.success('审批已通过，系统处理中');
          } else {
            message.success('已通过');
          }
          break;
        }
        case 'reject':
          if (!actionComment.trim()) {
            message.warning('请填写拒绝原因');
            return;
          }
          await oaApi.reject(instanceId, { comment: actionComment });
          message.success('已拒绝');
          break;
        case 'transfer':
          if (transferUserId) {
            await oaApi.transfer(instanceId, { transferToUserId: transferUserId, comment: actionComment });
          }
          message.success('已转交');
          break;
        case 'countersign':
          if (countersignUserIds.length === 0) {
            message.warning('请选择加签人员');
            return;
          }
          await oaApi.countersign(instanceId, {
            countersignType,
            countersignUserIds,
            comment: actionComment || undefined,
          });
          message.success('已加签');
          break;
        case 'update': {
          // 操作型节点：发送编辑 diff 合并到原始 formData
          const editedDiff = editableFormRef?.current?.getEditedValues() || {};
          await oaApi.updateInstance(instanceId, {
            formData: { ...(detail?.formData || {}), ...editedDiff },
            comment: actionComment || undefined,
          });
          message.success('数据已保存');
          break;
        }
        case 'comment':
          if (!actionComment.trim()) {
            message.warning('请输入评论内容');
            return;
          }
          await oaApi.addComment(instanceId, { comment: actionComment });
          message.success('评论已添加');
          break;
      }
      setActionModalVisible(false);
      setActionComment('');
      setTransferUserId(null);
      setCountersignUserIds([]);
      setCountersignType('after');
      await onActionComplete?.();
    } catch (error) {
      message.error(getErrorMessage(error) || '操作失败');
    } finally {
      setActionLoading(false);
    }
  }, [instanceId, actionType, actionComment, transferUserId, countersignUserIds, countersignType, detail?.formData, onActionComplete, editableFormRef]);

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
    setCountersignUserIds([]);
    setCountersignType('after');
    if (type === 'transfer' || type === 'countersign') {
      oaApi.getTransferCandidates()
        .then((users) => setTransferUsers(users))
        .catch(() => setTransferUsers([]));
    }
  }, []);

  const closeActionModal = useCallback(() => {
    setActionModalVisible(false);
    setActionComment('');
    setTransferUserId(null);
    setCountersignUserIds([]);
    setCountersignType('after');
  }, []);

  return {
    actionLoading, actionModalVisible, actionType, actionComment, transferUsers,
    countersignUserIds, countersignType,
    openActionModal, closeActionModal, executeAction, executeWithdraw,
    setActionComment, setTransferUserId, setCountersignUserIds, setCountersignType,
    canOperate, canWithdraw, canComment, currentStep,
  };
}
