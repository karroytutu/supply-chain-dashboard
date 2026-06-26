/**
 * 顶部控制栏
 * 营销师选择器 + 月份选择器 + 状态标签
 */
import React from 'react';
import { Select, Tag, Button } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { Marketer, TargetStatus, TargetMonth } from '@/types/target-management';
import { STATUS_CONFIG } from '@/constants/targetManagement';
import styles from './index.less';

interface TargetToolbarProps {
  marketers: Marketer[];
  selectedMarketerId: string;
  onSelectMarketer: (id: string) => void;
  currentMonth: TargetMonth;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  status: TargetStatus;
  isHistoryMonth: boolean;
}

const TargetToolbar: React.FC<TargetToolbarProps> = ({
  marketers, selectedMarketerId, onSelectMarketer,
  currentMonth, onPrevMonth, onNextMonth,
  status, isHistoryMonth,
}) => {
  const statusCfg = STATUS_CONFIG[status];

  const options = [
    { value: 'all', label: '全部营销师' },
    ...marketers.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        <span className={styles.label}>营销师：</span>
        <Select
          value={selectedMarketerId}
          onChange={onSelectMarketer}
          options={options}
          style={{ width: 200 }}
        />
        <span className={styles.monthGroup}>
          <span className={styles.label}>月份：</span>
          <Button type="text" size="small" icon={<LeftOutlined />} onClick={onPrevMonth} />
          <span className={styles.monthText}>{currentMonth.year}年{currentMonth.month}月</span>
          <Button type="text" size="small" icon={<RightOutlined />} onClick={onNextMonth} />
        </span>
      </div>
      <div className={styles.right}>
        {isHistoryMonth && <Tag color="orange">只读</Tag>}
        <Tag color={statusCfg.tagColor}>{statusCfg.label}</Tag>
      </div>
    </div>
  );
};

export default TargetToolbar;
