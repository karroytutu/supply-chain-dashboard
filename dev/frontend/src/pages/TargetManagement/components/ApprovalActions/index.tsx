/**
 * 审批按钮区域
 * 根据角色和状态动态显示操作按钮
 */
import React from 'react';
import { Button, Modal, Input } from 'antd';
import {
  SaveOutlined, SendOutlined, RollbackOutlined,
  RedoOutlined, CheckOutlined, CloseOutlined,
} from '@ant-design/icons';
import type { TargetStatus, UserRole } from '@/types/target-management';
import styles from './index.less';

interface ApprovalActionsProps {
  status: TargetStatus;
  userRole: UserRole;
  readOnly: boolean;
  onSaveDraft: () => void;
  onSubmit: () => void;
  onWithdraw: () => void;
  onApprove: () => void;
  onReject: () => void;
  onResubmit: () => void;
}

const ApprovalActions: React.FC<ApprovalActionsProps> = ({
  status, userRole, readOnly,
  onSaveDraft, onSubmit, onWithdraw, onApprove, onReject, onResubmit,
}) => {
  if (readOnly) return null;

  const showRejectConfirm = () => {
    let reason = '';
    Modal.confirm({
      title: '驳回确认',
      content: (
        <Input.TextArea
          rows={3}
          placeholder="请输入驳回原因..."
          onChange={(e) => { reason = e.target.value; }}
        />
      ),
      okText: '确认驳回',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => onReject(),
    });
  };

  const showWithdrawConfirm = () => {
    Modal.confirm({
      title: '撤回确认',
      content: '确定要撤回审批吗？撤回后可以修改再重新提交。',
      okText: '确认撤回',
      cancelText: '取消',
      onOk: () => onWithdraw(),
    });
  };

  const isMarketer = userRole === 'marketer';
  const isManager = userRole === 'manager';

  const leftButtons: React.ReactNode[] = [];
  const rightButtons: React.ReactNode[] = [];

  if (isMarketer && status === 'draft') {
    leftButtons.push(
      <Button key="save" icon={<SaveOutlined />} onClick={onSaveDraft}>保存草稿</Button>,
    );
    rightButtons.push(
      <Button key="submit" type="primary" icon={<SendOutlined />} onClick={onSubmit}>提交审批</Button>,
    );
  }

  if (isMarketer && status === 'pending') {
    rightButtons.push(
      <Button key="withdraw" icon={<RollbackOutlined />} onClick={showWithdrawConfirm}>撤回</Button>,
    );
  }

  if (isMarketer && status === 'rejected') {
    rightButtons.push(
      <Button key="resubmit" type="primary" icon={<RedoOutlined />} onClick={onResubmit}>重新提交</Button>,
    );
  }

  if (isManager && status === 'pending') {
    rightButtons.push(
      <Button key="reject" danger icon={<CloseOutlined />} onClick={showRejectConfirm}>驳回</Button>,
      <Button key="approve" type="primary" icon={<CheckOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={onApprove}>通过</Button>,
    );
  }

  if (isManager && status === 'approved') {
    rightButtons.push(
      <Button key="reject" danger icon={<CloseOutlined />} onClick={showRejectConfirm}>驳回</Button>,
    );
  }

  if (leftButtons.length === 0 && rightButtons.length === 0) return null;

  return (
    <div className={styles.actions}>
      <div className={styles.left}>{leftButtons}</div>
      <div className={styles.right}>{rightButtons}</div>
    </div>
  );
};

export default ApprovalActions;
