/**
 * 概览统计条组件
 * 展示4个关键汇总数字
 */

import React from 'react';
import {
  ExclamationCircleOutlined,
  ThunderboltOutlined,
  PlusCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { WorkspaceSummary } from '@/types/workspace';
import styles from './SummaryBar.less';

interface SummaryBarProps {
  summary: WorkspaceSummary | null;
}

const SummaryBar: React.FC<SummaryBarProps> = ({ summary }) => {
  const items = [
    {
      icon: <ExclamationCircleOutlined />,
      iconClass: 'danger',
      label: '待处理总数',
      value: summary?.totalPending ?? 0,
    },
    {
      icon: <ThunderboltOutlined />,
      iconClass: 'warning',
      label: '紧急事项',
      value: summary?.urgentCount ?? 0,
    },
    {
      icon: <PlusCircleOutlined />,
      iconClass: 'info',
      label: '今日新增',
      value: summary?.todayNew ?? 0,
    },
    {
      icon: <CheckCircleOutlined />,
      iconClass: 'success',
      label: '今日已处理',
      value: summary?.todayDone ?? 0,
    },
  ];

  return (
    <div className={styles.bar}>
      {items.map((item) => (
        <div className={styles.item} key={item.label}>
          <div className={`${styles.icon} ${styles[item.iconClass]}`}>
            {item.icon}
          </div>
          <div className={styles.infoText}>
            <div className={styles.label}>{item.label}</div>
            <div className={styles.value}>
              {item.value}
              <span className={styles.unit}>项</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SummaryBar;
