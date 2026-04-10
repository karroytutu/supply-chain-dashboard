/**
 * 优先级标识组件
 * 根据优先级显示对应颜色和文字标识
 */
import React from 'react';
import { Badge } from 'antd';
import type { CollectionPriority } from '@/types/ar-collection';

interface PriorityBadgeProps {
  /** 优先级 */
  priority: CollectionPriority;
  /** 是否显示文字标签 */
  showLabel?: boolean;
}

/** 优先级颜色配置 */
export const PRIORITY_COLORS: Record<CollectionPriority, string> = {
  critical: '#cf1322',
  high: '#fa541c',
  medium: '#d48806',
  low: '#8c8c8c',
};

/** 优先级标签配置 */
const PRIORITY_LABELS: Record<CollectionPriority, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
};

const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  priority,
  showLabel = true,
}) => {
  const color = PRIORITY_COLORS[priority];
  if (!color) return null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Badge color={color} />
      {showLabel && (
        <span style={{ color, fontWeight: 500, fontSize: 13 }}>
          {PRIORITY_LABELS[priority]}
        </span>
      )}
    </span>
  );
};

export default PriorityBadge;
