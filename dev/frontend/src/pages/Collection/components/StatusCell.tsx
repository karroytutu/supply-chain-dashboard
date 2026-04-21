/**
 * 状态单元格组件
 * 根据任务状态显示对应颜色的简洁标签
 */
import React from 'react';
import { Tag } from 'antd';
import type { CollectionTaskStatus } from '@/types/ar-collection';

interface StatusCellProps {
  /** 任务状态 */
  status: CollectionTaskStatus;
}

/** 状态配置 */
const STATUS_CONFIG: Record<CollectionTaskStatus, { label: string; color: string }> = {
  collecting: { label: '催收中', color: 'blue' },
  difference_processing: { label: '差异处理', color: 'gold' },
  extension: { label: '延期中', color: 'purple' },
  escalated: { label: '已升级', color: 'red' },
  pending_verify: { label: '待核销', color: 'cyan' },
  verified: { label: '已核销', color: 'green' },
  closed: { label: '已关闭', color: 'default' },
};

const StatusCell: React.FC<StatusCellProps> = ({ status }) => {
  const config = STATUS_CONFIG[status];

  if (!config) {
    return <Tag>{status}</Tag>;
  }

  return <Tag color={config.color}>{config.label}</Tag>;
};

export default StatusCell;
