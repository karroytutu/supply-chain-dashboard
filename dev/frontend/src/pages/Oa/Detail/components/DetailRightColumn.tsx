import React from 'react';
import { Card, Button, Popconfirm, Dropdown } from 'antd';
import {
  SwapOutlined,
  CheckOutlined,
  CloseOutlined,
  UndoOutlined,
  MoreOutlined,
  RollbackOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import type { ApprovalDetail } from '@/types/oa';
import { ApprovalFlow, ActionModal } from '@/components/Oa';
import { getInteractionType } from '@/utils/oa';
import styles from '../index.less';

type ActionType = 'approve' | 'reject' | 'transfer' | 'countersign' | 'update' | null;

/** 右侧栏：审批流程（可滚动）+ 操作按钮（固定底部）+ 操作弹窗 */
export const DetailRightColumn: React.FC<{
  detail: ApprovalDetail;
  nodes: ApprovalDetail['nodes'];
  actions: ApprovalDetail['actions'];
  actionLoading: boolean;
  actionModalVisible: boolean;
  actionType: ActionType;
  actionComment: string;
  transferUsers: Array<{ id: number; name: string }>;
  getCurrentStep: () => number;
  canOperate: () => boolean;
  canWithdraw: () => boolean;
  openActionModal: (type: 'approve' | 'reject' | 'transfer' | 'countersign' | 'update') => void;
  handleAction: () => Promise<void>;
  handleWithdraw: () => Promise<void>;
  setActionModalVisible: (v: boolean) => void;
  setActionComment: (v: string) => void;
  setTransferUserId: (v: number | null) => void;
}> = ({
  detail, nodes, actions, actionLoading, actionModalVisible, actionType,
  actionComment, transferUsers, getCurrentStep, canOperate, canWithdraw,
  openActionModal, handleAction, handleWithdraw, setActionModalVisible,
  setActionComment, setTransferUserId,
}) => (
  <>
    <div className={styles.detailRightScroll}>
      <Card title="审批流程" style={{ marginBottom: 16 }}>
        <ApprovalFlow mode="actual" nodes={nodes} actions={actions} ccUsers={detail.ccUsers}
          currentStep={getCurrentStep()} instanceStatus={detail.status} erpMeta={detail.erpMeta}
          instanceId={detail.id} applicantName={detail.applicantName}
          applicantAvatar={detail.applicantAvatar} submittedAt={detail.submittedAt} />
      </Card>
    </div>
    {canOperate() && (() => {
      const interactionType = getInteractionType(detail);
      if (interactionType === 'operation') {
        // 操作型节点：[更新] [完成] + 更多菜单
        return (
          <div className={styles.actionBarFixed}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Dropdown menu={{
                items: [
                  { key: 'rollback', icon: <RollbackOutlined />, label: '退回', onClick: () => openActionModal('reject') },
                  { key: 'transfer', icon: <SwapOutlined />, label: '转交', onClick: () => openActionModal('transfer') },
                ],
              }}>
                <Button icon={<MoreOutlined />}>更多</Button>
              </Dropdown>
              <Button icon={<SaveOutlined />} onClick={() => openActionModal('update')} block>更新</Button>
              <Button type="primary" icon={<CheckOutlined />} onClick={() => openActionModal('approve')} block>完成</Button>
            </div>
          </div>
        );
      }
      // 审批型节点（默认）：[转交] [驳回] [同意]
      return (
        <div className={styles.actionBarFixed}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<SwapOutlined />} onClick={() => openActionModal('transfer')} block>转交</Button>
            <Button danger icon={<CloseOutlined />} onClick={() => openActionModal('reject')} block>驳回</Button>
            <Button type="primary" icon={<CheckOutlined />} onClick={() => openActionModal('approve')} block>同意</Button>
          </div>
        </div>
      );
    })()}
    {canWithdraw() && !canOperate() && (
      <div className={styles.actionBarFixed}>
        <Popconfirm title="确定要撤回此审批吗？" onConfirm={handleWithdraw} okText="确定" cancelText="取消">
          <Button danger icon={<UndoOutlined />} block loading={actionLoading}>撤回审批</Button>
        </Popconfirm>
      </div>
    )}
    <ActionModal visible={actionModalVisible} actionType={actionType} actionComment={actionComment}
      actionLoading={actionLoading} transferUsers={transferUsers} interactionType={getInteractionType(detail)}
      onOk={handleAction} onCancel={() => setActionModalVisible(false)} onCommentChange={setActionComment}
      onTransferUserChange={setTransferUserId} />
  </>
);
