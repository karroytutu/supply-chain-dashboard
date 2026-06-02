import React from 'react';
import { Modal, Input, Select } from 'antd';

const { TextArea } = Input;

interface TransferUser {
  id: number;
  name: string;
}

interface ActionModalProps {
  visible: boolean;
  actionType: 'approve' | 'reject' | 'transfer' | 'countersign' | null;
  actionComment: string;
  actionLoading: boolean;
  /** 转交候选人列表（从后端获取） */
  transferUsers?: TransferUser[];
  onOk: () => Promise<void>;
  onCancel: () => void;
  onCommentChange: (comment: string) => void;
  onTransferUserChange: (id: number | null) => void;
}

/** 获取操作弹窗标题 */
const getActionModalTitle = (actionType: string | null) => {
  switch (actionType) {
    case 'approve': return '已通过';
    case 'reject': return '已驳回';
    case 'transfer': return '转交';
    case 'countersign': return '加签处理';
    default: return '操作';
  }
};

const ActionModal: React.FC<ActionModalProps> = ({
  visible, actionType, actionComment, actionLoading, transferUsers = [],
  onOk, onCancel, onCommentChange, onTransferUserChange,
}) => {
  return (
    <Modal
      title={getActionModalTitle(actionType)}
      open={visible}
      onOk={onOk}
      onCancel={onCancel}
      confirmLoading={actionLoading}
      okText="确定"
      cancelText="取消"
    >
      <div className="actionModal">
        {actionType === 'transfer' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>转交人员：</label>
            <Select
              style={{ width: '100%' }}
              placeholder="请选择转交人员"
              onChange={(value) => onTransferUserChange(value)}
              showSearch
              optionFilterProp="label"
              options={transferUsers.map((u) => ({ value: u.id, label: u.name }))}
            />
          </div>
        )}
        <div style={{ marginBottom: 0 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>审批意见：</label>
          <TextArea
            rows={4}
            placeholder="请输入审批意见（选填）"
            value={actionComment}
            onChange={(e) => onCommentChange(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
};

export default ActionModal;
