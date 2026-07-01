/**
 * 顶部控制栏
 * 营销师选择器 + 月份选择器 + 返回概览按钮 + 保存按钮
 */
import React from 'react';
import { Select, Tag, Button } from 'antd';
import { LeftOutlined, RightOutlined, SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import type { TargetMonth } from '@/types/target-management';
import styles from './index.less';

interface TargetToolbarProps {
  marketers: Array<{ id: string; name: string }>;
  selectedMarketerId: string;
  onSelectMarketer: (id: string) => void;
  currentMonth: TargetMonth;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canPrevMonth: boolean;
  isHistoryMonth: boolean;
  readOnly: boolean;
  canSave: boolean;
  /** 是否有未保存的变更 */
  isDirty?: boolean;
  onSave: () => void;
  /** 返回概览视图（编辑模式下显示） */
  onBackToOverview?: () => void;
}

const TargetToolbar: React.FC<TargetToolbarProps> = ({
  marketers,
  selectedMarketerId,
  onSelectMarketer,
  currentMonth,
  onPrevMonth,
  onNextMonth,
  canPrevMonth,
  isHistoryMonth,
  readOnly,
  canSave,
  isDirty,
  onSave,
  onBackToOverview,
}) => {
  const isEditMode = !!selectedMarketerId;

  const options = [
    { value: '', label: '全部营销师' },
    ...marketers.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        {isEditMode && onBackToOverview && (
          <Button
            type="text"
            size="small"
            icon={<ArrowLeftOutlined />}
            onClick={onBackToOverview}
            className={styles.backBtn}
          >
            概览
          </Button>
        )}
        <span className={styles.label}>营销师：</span>
        <Select
          value={selectedMarketerId}
          onChange={onSelectMarketer}
          options={options}
          style={{ width: 200 }}
        />
        <span className={styles.monthGroup}>
          <span className={styles.label}>月份：</span>
          <Button type="text" size="small" icon={<LeftOutlined />} onClick={onPrevMonth} disabled={!canPrevMonth} />
          <span className={styles.monthText}>
            {currentMonth.year}年{currentMonth.month}月
          </span>
          <Button type="text" size="small" icon={<RightOutlined />} onClick={onNextMonth} />
        </span>
      </div>
      <div className={styles.right}>
        {isHistoryMonth && <Tag color="orange">历史月份（只读）</Tag>}
        {readOnly && !isHistoryMonth && isEditMode && <Tag color="default">只读</Tag>}
        {isDirty && <span className={styles.dirtyHint}>有未保存的变更</span>}
        {canSave && isEditMode && (
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={onSave}
            size="middle"
            style={isDirty ? { background: '#faad14', borderColor: '#faad14' } : undefined}
          >
            保存目标
          </Button>
        )}
      </div>
    </div>
  );
};

export default React.memo(TargetToolbar);
