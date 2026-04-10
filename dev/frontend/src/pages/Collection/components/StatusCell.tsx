/**
 * 状态单元格组件
 * 将优先级和状态合并显示，通过左侧色条表示优先级，标签+图标表示状态
 */
import React from 'react';
import { Tag } from 'antd';
import {
  ClockCircleOutlined,
  WarningOutlined,
  PauseCircleOutlined,
  VerticalAlignTopOutlined,
  FileSearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { CollectionTaskStatus, CollectionPriority } from '@/types/ar-collection';

interface StatusCellProps {
  /** 任务状态 */
  status: CollectionTaskStatus;
  /** 优先级 */
  priority: CollectionPriority;
  /** 是否显示图标，默认 true */
  showIcon?: boolean;
  /** 紧凑模式（移动端），默认 false */
  compact?: boolean;
}

/** 优先级颜色配置 */
export const PRIORITY_COLORS: Record<CollectionPriority, string> = {
  critical: '#cf1322',
  high: '#fa541c',
  medium: '#d48806',
  low: '#8c8c8c',
};

/** 状态配置 */
const STATUS_CONFIG: Record<
  CollectionTaskStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  collecting: {
    label: '催收中',
    color: 'blue',
    icon: <ClockCircleOutlined />,
  },
  difference_processing: {
    label: '差异处理',
    color: 'gold',
    icon: <WarningOutlined />,
  },
  extension: {
    label: '延期中',
    color: 'purple',
    icon: <PauseCircleOutlined />,
  },
  escalated: {
    label: '已升级',
    color: 'red',
    icon: <VerticalAlignTopOutlined />,
  },
  pending_verify: {
    label: '待核销',
    color: 'cyan',
    icon: <FileSearchOutlined />,
  },
  verified: {
    label: '已核销',
    color: 'green',
    icon: <CheckCircleOutlined />,
  },
  closed: {
    label: '已关闭',
    color: 'default',
    icon: <CloseCircleOutlined />,
  },
};

const StatusCell: React.FC<StatusCellProps> = ({
  status,
  priority,
  showIcon = true,
  compact = false,
}) => {
  const statusConfig = STATUS_CONFIG[status];
  const priorityColor = PRIORITY_COLORS[priority];

  if (!statusConfig) {
    return <Tag>{status}</Tag>;
  }

  return (
    <div className={`status-cell ${compact ? 'status-cell--compact' : ''}`}>
      <div className="status-cell__indicator" style={{ backgroundColor: priorityColor }} />
      <Tag
        color={statusConfig.color}
        icon={showIcon ? statusConfig.icon : undefined}
        className="status-cell__tag"
      >
        {statusConfig.label}
      </Tag>
    </div>
  );
};

export default StatusCell;
