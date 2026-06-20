/**
 * OA 审批操作栏组件
 * 审批型节点 (approval)：左侧垂直图标文字项（转交/退回/加签/评论）+ 右侧拒绝/同意按钮
 * 处理型节点 (handle)：左侧垂直图标文字项（评论/退回/转交）+ 右侧保存/完成按钮
 * 所有屏幕尺寸使用 position: sticky 固定底部
 */
import React from 'react';
import { Tooltip, Dropdown, Popconfirm, Button, type MenuProps } from 'antd';
import {
  SwapOutlined, TeamOutlined, MessageOutlined,
  RollbackOutlined, SaveOutlined,
  CheckOutlined, CloseOutlined, EllipsisOutlined,
} from '@ant-design/icons';
import { useMobileDetect } from '@/hooks/useMobileDetect';
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

// ==================== 折叠常量 ====================

/** 移动端左侧可见的操作项数量，剩余折叠进"更多" */
const MOBILE_VISIBLE_COUNT = 2;

/** 左侧操作项数据（用于统一渲染和折叠） */
interface LeftItemData {
  icon: React.ReactElement;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tooltip?: string;
}

// ==================== ActionBar 主组件 ====================

export interface ActionBarProps {
  nodeType: 'approval' | 'handle' | 'auto';
  canOperate: boolean;
  canWithdraw: boolean;
  canComment: boolean;
  onOpenAction: (type: 'approve' | 'reject' | 'transfer' | 'countersign' | 'update' | 'comment') => void;
  onWithdraw: () => void;
}

/** 渲染"更多" Dropdown（独立实现，不复用 ActionItem 的 dropdown prop，避免 onKeyDown 冲突） */
const renderMoreDropdown = (overflowItems: LeftItemData[]) => {
  if (overflowItems.length === 0) return null;
  const menuItems: MenuProps['items'] = overflowItems.map((item, i) => ({
    key: String(i),
    icon: item.icon,
    label: item.tooltip && item.disabled
      ? <Tooltip title={item.tooltip}><span>{item.label}</span></Tooltip>
      : item.label,
    disabled: item.disabled,
    onClick: item.onClick,
  }));
  return (
    <Dropdown
      menu={{ items: menuItems }}
      trigger={['click']}
      placement="topLeft"
    >
      <div className={styles.actionItem}>
        <span className={styles.actionItemIcon}><EllipsisOutlined /></span>
        <span className={styles.actionItemLabel}>更多</span>
      </div>
    </Dropdown>
  );
};

/** 渲染左侧操作项（PC 全部显示，移动端前 N 项 + "更多"折叠） */
const renderLeftItems = (items: LeftItemData[], isMobile: boolean) => {
  const visibleCount = isMobile ? Math.min(MOBILE_VISIBLE_COUNT, items.length) : items.length;
  const visibleItems = items.slice(0, visibleCount);
  const overflowItems = isMobile ? items.slice(visibleCount) : [];

  return (
    <>
      {visibleItems.map((item) => (
        <ActionItem key={item.label} {...item} />
      ))}
      {renderMoreDropdown(overflowItems)}
    </>
  );
};

const ActionBar: React.FC<ActionBarProps> = ({
  nodeType, canOperate, canWithdraw, canComment, onOpenAction, onWithdraw,
}) => {
  const isMobile = useMobileDetect();

  if (canOperate) {
    // ── 处理型节点 (handle) ──
    if (nodeType === 'handle') {
      const leftItems: LeftItemData[] = [
        ...(canComment ? [{ icon: <MessageOutlined />, label: '评论', onClick: () => onOpenAction('comment') }] : []),
        { icon: <RollbackOutlined />, label: '退回', onClick: () => onOpenAction('reject') },
        { icon: <SwapOutlined />, label: '转交', onClick: () => onOpenAction('transfer') },
      ];

      return (
        <div className={styles.actionBar}>
          <div className={styles.actionLeft}>
            {renderLeftItems(leftItems, isMobile)}
          </div>
          <div className={styles.actionRight}>
            <button type="button" className={styles.secondaryBtn} onClick={() => onOpenAction('update')}>
              <SaveOutlined /> <span>保存</span>
            </button>
            <button type="button" className={styles.primaryBtn} onClick={() => onOpenAction('approve')}>
              <CheckOutlined /> <span>完成</span>
            </button>
          </div>
        </div>
      );
    }

    // ── 审批型节点 (approval) ──
    const leftItems: LeftItemData[] = [
      { icon: <SwapOutlined />, label: '转交', onClick: () => onOpenAction('transfer') },
      { icon: <RollbackOutlined />, label: '退回', onClick: () => onOpenAction('reject') },
      { icon: <TeamOutlined />, label: '加签', onClick: () => onOpenAction('countersign') },
      ...(canComment ? [{ icon: <MessageOutlined />, label: '评论', onClick: () => onOpenAction('comment') }] : []),
    ];

    return (
      <div className={styles.actionBar}>
        <div className={styles.actionLeft}>
          {renderLeftItems(leftItems, isMobile)}
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
        <Popconfirm title="确定要撤回此审批吗？" onConfirm={onWithdraw} okText="确定" cancelText="取消" placement="top">
          <Button danger>撤回审批</Button>
        </Popconfirm>
      </div>
    );
  }

  return null;
};

export default ActionBar;
