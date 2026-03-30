/**
 * 移动端卡片组件
 * 统一的移动端卡片布局，支持标题区、信息区、操作区
 */
import React from 'react';
import { Tag } from 'antd';
import styles from './MobileCard.less';

interface InfoItem {
  label: string;
  value: React.ReactNode;
  /** 是否为金额样式 */
  isAmount?: boolean;
  /** 是否为警告样式 */
  isWarning?: boolean;
}

interface MobileCardProps {
  /** 卡片标题（通常为客户名） */
  title: React.ReactNode;
  /** 标题前的图标 */
  titleIcon?: React.ReactNode;
  /** 右侧额外内容（如状态标签） */
  extra?: React.ReactNode;
  /** 状态标签配置 */
  status?: {
    text: string;
    color: string;
  };
  /** 信息项列表 */
  info: InfoItem[];
  /** 操作按钮区域 */
  actions?: React.ReactNode;
  /** 是否显示超时/警告样式 */
  warning?: boolean;
  /** 是否显示紧急样式 */
  urgent?: boolean;
  /** 点击回调 */
  onClick?: () => void;
  /** 自定义类名 */
  className?: string;
  /** 子内容（扩展区域） */
  children?: React.ReactNode;
}

const MobileCard: React.FC<MobileCardProps> = ({
  title,
  titleIcon,
  extra,
  status,
  info,
  actions,
  warning = false,
  urgent = false,
  onClick,
  className,
  children,
}) => {
  const cardClassName = [
    styles.mobileCard,
    warning && styles.warning,
    urgent && styles.urgent,
    onClick && styles.clickable,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClassName} onClick={onClick}>
      {/* 卡片头部 */}
      <div className={styles.cardHeader}>
        <div className={styles.titleRow}>
          {titleIcon && <span className={styles.titleIcon}>{titleIcon}</span>}
          <span className={styles.title}>{title}</span>
        </div>
        {status && (
          <Tag color={status.color} className={styles.statusTag}>
            {status.text}
          </Tag>
        )}
        {extra}
      </div>

      {/* 信息区域 */}
      <div className={styles.infoGrid}>
        {info.map((item, index) => (
          <div key={index} className={styles.infoItem}>
            <span className={styles.infoLabel}>{item.label}</span>
            <span
              className={[
                styles.infoValue,
                item.isAmount && styles.amount,
                item.isWarning && styles.warning,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {/* 扩展内容 */}
      {children}

      {/* 操作按钮 */}
      {actions && <div className={styles.actionBar}>{actions}</div>}
    </div>
  );
};

export default MobileCard;
