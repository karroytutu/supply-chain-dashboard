/**
 * 催收状态标签组件
 * 根据任务状态显示对应颜色和图标的标签
 */
import React from 'react';
import { Tag } from 'antd';
import {
  ClockCircleOutlined,
  WarningOutlined,
  HourglassOutlined,
  VerticalAlignTopOutlined,
  FileSearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { CollectionTaskStatus } from '@/types/ar-collection';

interface StatusTagProps {
  /** 任务状态 */
  status: CollectionTaskStatus;
  /** 是否显示图标 */
  showIcon?: boolean;
}

/** 状态配置映射 */
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
    icon: <HourglassOutlined />,
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

const StatusTag: React.FC<StatusTagProps> = ({ status, showIcon = true }) => {
  const config = STATUS_CONFIG[status];
  if (!config) return <Tag>{status}</Tag>;

  return (
    <Tag color={config.color} icon={showIcon ? config.icon : undefined}>
      {config.label}
    </Tag>
  );
};

export default StatusTag;
