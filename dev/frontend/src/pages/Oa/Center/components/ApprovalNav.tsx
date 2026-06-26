import React from 'react';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  SendOutlined,
  BellOutlined,
} from '@ant-design/icons';
import type { ApprovalStats, ViewMode } from '@/types/oa';
import styles from '../index.less';

interface NavItem {
  key: string;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  count: number | null;
}

interface ApprovalNavProps {
  viewMode: ViewMode;
  stats: ApprovalStats;
  onNavClick: (mode: ViewMode) => void;
}

/** 格式化标签文字，有数量时在后面加括号 */
function formatLabel(text: string, count: number | null): string {
  return count != null && count > 0 ? `${text}(${count})` : text;
}

const ApprovalNav: React.FC<ApprovalNavProps> = ({ viewMode, stats, onNavClick }) => {
  const navItems: NavItem[] = [
    { key: 'pending', label: '待处理的', shortLabel: '待办', icon: <ClockCircleOutlined />, count: stats.pending },
    { key: 'processed', label: '已处理的', shortLabel: '已办', icon: <CheckCircleOutlined />, count: null },
    { key: 'my', label: '我发起的', shortLabel: '发起', icon: <SendOutlined />, count: null },
    { key: 'cc', label: '抄送我的', shortLabel: '抄送', icon: <BellOutlined />, count: stats.cc },
  ];

  return (
    <div className={styles.nav}>
      {navItems.map((item) => (
        <div
          key={item.key}
          className={`${styles.navItem} ${viewMode === item.key ? styles.navItemActive : ''}`}
          onClick={() => onNavClick(item.key as ViewMode)}
        >
          <span className={styles.navIcon}>{item.icon}</span>
          <span className={styles.navLabel}>{formatLabel(item.label, item.count)}</span>
          <span className={styles.navShortLabel}>{formatLabel(item.shortLabel, item.count)}</span>
        </div>
      ))}
    </div>
  );
};

export default ApprovalNav;
