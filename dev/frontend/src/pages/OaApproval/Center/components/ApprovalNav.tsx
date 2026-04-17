import React from 'react';
import { Badge } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  SendOutlined,
  BellOutlined,
} from '@ant-design/icons';
import type { ApprovalStats, ViewMode } from '@/types/oa-approval';
import styles from '../index.less';

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  count: number | null;
  badgeType: 'number' | 'dot';
}

interface ApprovalNavProps {
  viewMode: ViewMode;
  stats: ApprovalStats;
  onNavClick: (mode: ViewMode) => void;
}

const ApprovalNav: React.FC<ApprovalNavProps> = ({ viewMode, stats, onNavClick }) => {
  const navItems: NavItem[] = [
    { key: 'pending', label: '待处理的', icon: <ClockCircleOutlined />, count: stats.pending, badgeType: 'number' },
    { key: 'processed', label: '已处理的', icon: <CheckCircleOutlined />, count: null, badgeType: 'number' },
    { key: 'my', label: '我发起的', icon: <SendOutlined />, count: null, badgeType: 'number' },
    { key: 'cc', label: '抄送我的', icon: <BellOutlined />, count: stats.cc, badgeType: 'dot' },
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
          <span className={styles.navLabel}>{item.label}</span>
          {item.badgeType === 'number' && item.count && item.count > 0 && (
            <Badge count={item.count} style={{ backgroundColor: '#fa8c16' }} />
          )}
          {item.badgeType === 'dot' && item.count && item.count > 0 && (
            <Badge dot style={{ backgroundColor: '#f5222d' }} />
          )}
        </div>
      ))}
    </div>
  );
};

export default ApprovalNav;
