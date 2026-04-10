/**
 * 快捷筛选组件 - 分组标签化
 * 按优先级、状态、时间三个维度分组筛选
 */
import React from 'react';
import { Tag } from 'antd';
import type { CollectionTaskStatus } from '@/types/ar-collection';

export type PriorityFilter = 'critical' | 'high' | 'medium' | 'low' | null;
export type StatusFilterType = CollectionTaskStatus | null;
export type TimeFilter = 'todayDue' | 'timeout7' | 'thisMonth' | null;

interface QuickFiltersProps {
  priority: PriorityFilter;
  status: StatusFilterType;
  time: TimeFilter;
  onPriorityChange: (priority: PriorityFilter) => void;
  onStatusChange: (status: StatusFilterType) => void;
  onTimeChange: (time: TimeFilter) => void;
  onClearAll: () => void;
}

/** 优先级配置 */
const PRIORITY_OPTIONS: Array<{ key: PriorityFilter; label: string; color: string }> = [
  { key: 'critical', label: '紧急', color: '#ff4d4f' },
  { key: 'high', label: '高', color: '#fa8c16' },
  { key: 'medium', label: '中', color: '#faad14' },
  { key: 'low', label: '低', color: '#52c41a' },
];

/** 状态配置 */
const STATUS_OPTIONS: Array<{ key: StatusFilterType; label: string }> = [
  { key: 'collecting', label: '催收中' },
  { key: 'extension', label: '延期中' },
  { key: 'difference_processing', label: '差异' },
  { key: 'escalated', label: '已升级' },
  { key: 'pending_verify', label: '待核销' },
];

/** 时间配置 */
const TIME_OPTIONS: Array<{ key: TimeFilter; label: string }> = [
  { key: 'todayDue', label: '今日到期' },
  { key: 'timeout7', label: '超时7天' },
  { key: 'thisMonth', label: '本月新增' },
];

const QuickFilters: React.FC<QuickFiltersProps> = ({
  priority,
  status,
  time,
  onPriorityChange,
  onStatusChange,
  onTimeChange,
  onClearAll,
}) => {
  const hasFilters = priority || status || time;

  return (
    <div className="quick-filters-group">
      {/* 优先级筛选 */}
      <div className="filter-group">
        <span className="filter-label">优先级:</span>
        <div className="filter-tags">
          {PRIORITY_OPTIONS.map((opt) => (
            <Tag
              key={opt.key}
              className={`filter-tag ${priority === opt.key ? 'active' : ''}`}
              style={{
                borderColor: priority === opt.key ? opt.color : undefined,
                color: priority === opt.key ? opt.color : undefined,
              }}
              onClick={() => onPriorityChange(priority === opt.key ? null : opt.key)}
            >
              {opt.label}
            </Tag>
          ))}
        </div>
      </div>

      {/* 状态筛选 */}
      <div className="filter-group">
        <span className="filter-label">状态:</span>
        <div className="filter-tags">
          {STATUS_OPTIONS.map((opt) => (
            <Tag
              key={opt.key}
              className={`filter-tag ${status === opt.key ? 'active' : ''}`}
              onClick={() => onStatusChange(status === opt.key ? null : opt.key)}
            >
              {opt.label}
            </Tag>
          ))}
        </div>
      </div>

      {/* 时间筛选 */}
      <div className="filter-group">
        <span className="filter-label">时间:</span>
        <div className="filter-tags">
          {TIME_OPTIONS.map((opt) => (
            <Tag
              key={opt.key}
              className={`filter-tag ${time === opt.key ? 'active' : ''}`}
              onClick={() => onTimeChange(time === opt.key ? null : opt.key)}
            >
              {opt.label}
            </Tag>
          ))}
        </div>
      </div>

      {/* 清除筛选 */}
      {hasFilters && (
        <div className="clear-filters">
          <Tag color="blue" closable onClose={onClearAll}>
            清除筛选
          </Tag>
        </div>
      )}
    </div>
  );
};

export default QuickFilters;
