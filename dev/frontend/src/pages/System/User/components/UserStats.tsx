/**
 * 用户统计卡片组件
 */
import React from 'react';
import { TeamOutlined, UserOutlined, StopOutlined } from '@ant-design/icons';
import type { UserStats as UserStatsType } from '../types';
import styles from '../index.less';

interface UserStatsProps {
  stats: UserStatsType;
  activeStatus?: 'active' | 'disabled';
  onStatusClick: (status?: 'active' | 'disabled') => void;
}

interface StatItem {
  key: 'all' | 'active' | 'disabled';
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

const UserStats: React.FC<UserStatsProps> = ({
  stats,
  activeStatus,
  onStatusClick,
}) => {
  const statItems: StatItem[] = [
    {
      key: 'all',
      label: '全部用户',
      value: stats.total,
      icon: <TeamOutlined />,
      color: '#1890ff',
    },
    {
      key: 'active',
      label: '正常',
      value: stats.active,
      icon: <UserOutlined />,
      color: '#52c41a',
    },
    {
      key: 'disabled',
      label: '禁用',
      value: stats.disabled,
      icon: <StopOutlined />,
      color: '#ff4d4f',
    },
  ];

  return (
    <div className={styles.statsRow}>
      {statItems.map(item => {
        const isActive = 
          (item.key === 'all' && !activeStatus) ||
          (item.key === 'active' && activeStatus === 'active') ||
          (item.key === 'disabled' && activeStatus === 'disabled');

        return (
          <div
            key={item.key}
            className={`${styles.statsCard} ${isActive ? styles.statsCardActive : ''}`}
            onClick={() => onStatusClick(item.key === 'all' ? undefined : item.key as 'active' | 'disabled')}
          >
            <div className={styles.statsIcon} style={{ color: item.color }}>
              {item.icon}
            </div>
            <div className={styles.statsContent}>
              <div className={styles.statsValue}>{item.value}</div>
              <div className={styles.statsLabel}>{item.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export { UserStats };
export default UserStats;
