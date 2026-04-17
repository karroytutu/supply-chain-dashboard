import React from 'react';
import { Modal, Input, Select } from 'antd';

const { TextArea } = Input;
const { Option } = Select;

interface ActionModalProps {
  visible: boolean;
  actionType: 'approve' | 'reject' | 'transfer' | 'countersign' | null;
  actionComment: string;
  actionLoading: boolean;
  onOk: () => Promise<void>;
  onCancel: () => void;
  onCommentChange: (comment: string) => void;
  onTransferUserChange: (id: number | null) => void;
}

/** 获取操作弹窗标题 */
const getActionModalTitle = (actionType: string | null) => {
  switch (actionType) {
    case 'approve': return '审批通过';
    case 'reject': return '审批驳回';
    case 'transfer': return '转交审批';
    case 'countersign': return '加签处理';
    default: return '审批操作';
  }
};

const ActionModal: React.FC<ActionModalProps> = ({
  visible, actionType, actionComment, actionLoading,
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
              filterOption={(input, option) =>
                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
              }
            >
              <Option value={1}>张三</Option>
              <Option value={2}>李四</Option>
              <Option value={3}>王五</Option>
            </Select>
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
