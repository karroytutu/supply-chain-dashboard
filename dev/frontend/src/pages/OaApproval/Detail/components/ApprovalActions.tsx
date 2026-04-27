import React from 'react';
import { Card, Button, Popconfirm, Modal, Input, Select, Steps } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  SwapOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import type { ApprovalDetail, ApprovalNode } from '@/types/oa-approval';

interface ApprovalActionsProps {
  detail: ApprovalDetail;
  nodes: ApprovalNode[];
  canOperate: boolean;
  canWithdraw: boolean;
  actionLoading: boolean;
  actionModalVisible: boolean;
  actionType: 'approve' | 'reject' | 'transfer' | 'countersign' | null;
  actionComment: string;
  transferUserId: number | null;
  transferUsers: Array<{ id: number; name: string }>;
  currentStep: number;
  openActionModal: (type: 'approve' | 'reject' | 'transfer' | 'countersign') => void;
  handleAction: () => Promise<void>;
  handleWithdraw: () => Promise<void>;
  setActionModalVisible: (visible: boolean) => void;
  setActionComment: (comment: string) => void;
  setTransferUserId: (id: number | null) => void;
}

const ApprovalActions: React.FC<ApprovalActionsProps> = ({
  detail,
  nodes,
  canOperate,
  canWithdraw,
  actionLoading,
  actionModalVisible,
  actionType,
  actionComment,
  transferUserId,
  transferUsers,
  currentStep,
  openActionModal,
  handleAction,
  handleWithdraw,
  setActionModalVisible,
  setActionComment,
  setTransferUserId,
}) => {
  return (
    <Card title="审批操作" style={{ marginBottom: 16 }}>
      {/* 审批节点进度 */}
      <Steps
        direction="vertical"
        size="small"
        current={currentStep}
        items={nodes.map((node) => ({
          title: node.nodeName,
          description: node.assignedUserName || node.approverName || '-',
          status: (node.status === 'approved' ? 'finish' : node.status === 'rejected' ? 'error' : node.status === 'pending' ? 'process' : 'wait') as 'finish' | 'error' | 'process' | 'wait',
        }))}
      />

      {/* 操作按钮 */}
      {canOperate && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button icon={<SwapOutlined />} onClick={() => openActionModal('transfer')} block>
            转交
          </Button>
          <Button danger icon={<CloseOutlined />} onClick={() => openActionModal('reject')} block>
            驳回
          </Button>
          <Button type="primary" icon={<CheckOutlined />} onClick={() => openActionModal('approve')} block>
            同意
          </Button>
        </div>
      )}

      {canWithdraw && !canOperate && (
        <Popconfirm
          title="确定要撤回此审批吗？"
          onConfirm={handleWithdraw}
          okText="确定"
          cancelText="取消"
        >
          <Button danger icon={<UndoOutlined />} block loading={actionLoading}>
            撤回审批
          </Button>
        </Popconfirm>
      )}

      {/* 操作弹窗 */}
      <Modal
        title={actionType === 'approve' ? '同意审批' : actionType === 'reject' ? '驳回审批' : '转交审批'}
        open={actionModalVisible}
        onOk={handleAction}
        onCancel={() => setActionModalVisible(false)}
        confirmLoading={actionLoading}
        okText="确定"
        cancelText="取消"
      >
        {actionType === 'transfer' && (
          <Select
            placeholder="选择转交人员"
            value={transferUserId}
            onChange={setTransferUserId}
            style={{ width: '100%', marginBottom: 12 }}
            options={transferUsers.map(u => ({ label: u.name, value: u.id }))}
          />
        )}
        <Input.TextArea
          placeholder="请输入审批意见"
          value={actionComment}
          onChange={(e) => setActionComment(e.target.value)}
          rows={4}
        />
      </Modal>
    </Card>
  );
};

export default ApprovalActions;
