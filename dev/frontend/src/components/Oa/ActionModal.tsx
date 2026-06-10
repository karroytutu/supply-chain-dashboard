import React from 'react';
import { Modal, Input, Select, Segmented } from 'antd';

const { TextArea } = Input;

import type { NodeInteractionType } from '@/types/oa';

interface TransferUser {
  id: number;
  name: string;
}

interface ActionModalProps {
  visible: boolean;
  actionType: 'approve' | 'reject' | 'transfer' | 'countersign' | 'update' | 'comment' | null;
  actionComment: string;
  actionLoading: boolean;
  /** 转交候选人列表（从后端获取） */
  transferUsers?: TransferUser[];
  /** 节点交互类型，影响弹窗标题文案 */
  interactionType?: NodeInteractionType;
  onOk: () => Promise<void>;
  onCancel: () => void;
  onCommentChange: (comment: string) => void;
  onTransferUserChange: (id: number | null) => void;
  /** 加签选中的人员 ID 列表 */
  countersignUserIds?: number[];
  /** 加签类型：前加签/后加签 */
  countersignType?: 'before' | 'after';
  /** 加签人员变更回调 */
  onCountersignUserIdsChange?: (ids: number[]) => void;
  /** 加签类型变更回调 */
  onCountersignTypeChange?: (type: 'before' | 'after') => void;
}

/** 获取操作弹窗标题 */
const getActionModalTitle = (actionType: string | null, interactionType?: NodeInteractionType) => {
  if (actionType === 'comment') return '添加评论';
  if (interactionType === 'operation') {
    switch (actionType) {
      case 'approve': return '确认完成';
      case 'reject': return '拒绝';
      case 'update': return '更新数据';
      default: return actionType === 'transfer' ? '转交' : '操作';
    }
  }
  // 审批型（默认）保持原有标题
  switch (actionType) {
    case 'approve': return '已通过';
    case 'reject': return '已拒绝';
    case 'transfer': return '转交';
    case 'countersign': return '加签处理';
    default: return '操作';
  }
};

const ActionModal: React.FC<ActionModalProps> = ({
  visible, actionType, actionComment, actionLoading, transferUsers = [], interactionType,
  countersignUserIds = [], countersignType = 'after', onCountersignUserIdsChange, onCountersignTypeChange,
  onOk, onCancel, onCommentChange, onTransferUserChange,
}) => {
  return (
    <Modal
      title={getActionModalTitle(actionType, interactionType)}
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
        {actionType === 'countersign' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>加签类型：</label>
              <Segmented
                block
                value={countersignType}
                onChange={(v) => onCountersignTypeChange?.(v as 'before' | 'after')}
                options={[
                  { value: 'before', label: '前加签（加签人先审）' },
                  { value: 'after', label: '后加签（当前人先审）' },
                ]}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>加签人员：</label>
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="请选择加签人员"
                value={countersignUserIds}
                onChange={(ids) => onCountersignUserIdsChange?.(ids)}
                showSearch
                optionFilterProp="label"
                options={transferUsers.map((u) => ({ value: u.id, label: u.name }))}
              />
            </div>
          </>
        )}
        <div style={{ marginBottom: 0 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            {actionType === 'comment' ? '评论内容：' : '审批意见：'}
          </label>
          <TextArea
            rows={4}
            placeholder={actionType === 'comment' ? '请输入评论内容' : '请输入审批意见（选填）'}
            value={actionComment}
            onChange={(e) => onCommentChange(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
};

export default ActionModal;
