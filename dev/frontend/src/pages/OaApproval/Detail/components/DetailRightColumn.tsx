import React from 'react';
import { Card, Button, Popconfirm } from 'antd';
import {
  SwapOutlined,
  CheckOutlined,
  CloseOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { ApprovalDetail } from '@/types/oa-approval';
import { ApprovalFlow, ActionModal } from '@/components/OaApproval';
import styles from '../index.less';

type ActionType = 'approve' | 'reject' | 'transfer' | 'countersign' | null;

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
  openActionModal: (type: 'approve' | 'reject' | 'transfer' | 'countersign') => void;
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
          instanceId={detail.id} applicantName={detail.applicantName} applicantDept={detail.applicantDept}
          applicantAvatar={detail.applicantAvatar} submittedAt={detail.submittedAt} />
      </Card>
    </div>
    {canOperate() && (
      <div className={styles.actionBarFixed}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<SwapOutlined />} onClick={() => openActionModal('transfer')} block>转交</Button>
          <Button danger icon={<CloseOutlined />} onClick={() => openActionModal('reject')} block>驳回</Button>
          <Button type="primary" icon={<CheckOutlined />} onClick={() => openActionModal('approve')} block>同意</Button>
        </div>
      </div>
    )}
    {canWithdraw() && !canOperate() && (
      <div className={styles.actionBarFixed}>
        <Popconfirm title="确定要撤回此审批吗？" onConfirm={handleWithdraw} okText="确定" cancelText="取消">
          <Button danger icon={<UndoOutlined />} block loading={actionLoading}>撤回审批</Button>
        </Popconfirm>
      </div>
    )}
    <ActionModal visible={actionModalVisible} actionType={actionType} actionComment={actionComment}
      actionLoading={actionLoading} transferUsers={transferUsers} onOk={handleAction}
      onCancel={() => setActionModalVisible(false)} onCommentChange={setActionComment}
      onTransferUserChange={setTransferUserId} />
  </>
);
