/**
 * OA 审批操作栏组件
 * 审批型节点：左侧垂直图标文字项（转交/退回/加签/评论/更多）+ 右侧拒绝/同意按钮
 * 操作型节点：左侧垂直图标文字项（评论/退回/转交/更多）+ 右侧更新/完成按钮
 * 所有屏幕尺寸使用 position: sticky 固定底部
 */
import React from 'react';
import { Tooltip, Dropdown, Popconfirm, Button } from 'antd';
import {
  SwapOutlined, TeamOutlined, MessageOutlined,
  RollbackOutlined, SaveOutlined,
  CheckOutlined, CloseOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import styles from './ActionBar.less';

// ==================== ActionItem 子组件 ====================

interface ActionItemProps {
  icon: React.ReactElement;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tooltip?: string;
  dropdown?: MenuProps;
}

const ActionItem: React.FC<ActionItemProps> = ({
  icon, label, onClick, disabled, tooltip, dropdown,
}) => {
  const item = (
    <div
      className={`${styles.actionItem} ${disabled ? styles.actionItemDisabled : ''}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <span className={styles.actionItemIcon}>{icon}</span>
      <span className={styles.actionItemLabel}>{label}</span>
    </div>
  );

  if (disabled && tooltip) {
    return <Tooltip title={tooltip}>{item}</Tooltip>;
  }

  if (dropdown) {
    return <Dropdown menu={dropdown}>{item}</Dropdown>;
  }

  return item;
};

// ==================== ActionBar 主组件 ====================

export interface ActionBarProps {
  interactionType: 'approval' | 'operation';
  canOperate: boolean;
  canWithdraw: boolean;
  canComment: boolean;
  onOpenAction: (type: 'approve' | 'reject' | 'transfer' | 'countersign' | 'update' | 'comment') => void;
  onWithdraw: () => void;
}

const ActionBar: React.FC<ActionBarProps> = ({
  interactionType, canOperate, canWithdraw, canComment, onOpenAction, onWithdraw,
}) => {
  if (canOperate) {
    // ── 操作型节点 ──
    if (interactionType === 'operation') {
      return (
        <div className={styles.actionBar}>
          <div className={styles.actionLeft}>
            {canComment && (
              <ActionItem icon={<MessageOutlined />} label="评论" onClick={() => onOpenAction('comment')} />
            )}
            <ActionItem icon={<RollbackOutlined />} label="退回" onClick={() => onOpenAction('reject')} />
            <ActionItem icon={<SwapOutlined />} label="转交" onClick={() => onOpenAction('transfer')} />
          </div>
          <div className={styles.actionRight}>
            <button type="button" className={styles.secondaryBtn} onClick={() => onOpenAction('update')}>
              <SaveOutlined /> <span>更新</span>
            </button>
            <button type="button" className={styles.primaryBtn} onClick={() => onOpenAction('approve')}>
              <CheckOutlined /> <span>完成</span>
            </button>
          </div>
        </div>
      );
    }

    // ── 审批型节点 ──
    return (
      <div className={styles.actionBar}>
        <div className={styles.actionLeft}>
          <ActionItem icon={<SwapOutlined />} label="转交" onClick={() => onOpenAction('transfer')} />
          <ActionItem icon={<RollbackOutlined />} label="退回" onClick={() => onOpenAction('reject')} />
          <ActionItem icon={<TeamOutlined />} label="加签" disabled tooltip="功能开发中" />
          {canComment && (
            <ActionItem icon={<MessageOutlined />} label="评论" onClick={() => onOpenAction('comment')} />
          )}
        </div>
        <div className={styles.actionRight}>
          <button type="button" className={styles.secondaryBtn} onClick={() => onOpenAction('reject')}>
            <CloseOutlined /> <span>拒绝</span>
          </button>
          <button type="button" className={styles.primaryBtn} onClick={() => onOpenAction('approve')}>
            <CheckOutlined /> <span>同意</span>
          </button>
        </div>
      </div>
    );
  }

  // ── 仅评论模式 ──
  if (canComment) {
    return (
      <div className={styles.actionBar}>
        <div className={styles.actionLeft}>
          <ActionItem icon={<MessageOutlined />} label="评论" onClick={() => onOpenAction('comment')} />
        </div>
        <div className={styles.actionRight} />
      </div>
    );
  }

  // ── 撤回模式 ──
  if (canWithdraw) {
    return (
      <div className={styles.actionBar}>
        <Popconfirm title="确定要撤回此审批吗？" onConfirm={onWithdraw} okText="确定" cancelText="取消">
          <Button danger>撤回审批</Button>
        </Popconfirm>
      </div>
    );
  }

  return null;
};

export default ActionBar;
