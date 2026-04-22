/**
 * 状态单元格组件
 * 根据任务状态显示对应颜色的简洁标签
 * 升级状态根据层级区分显示
 */
import React from 'react';
import { Tag } from 'antd';
import type { CollectionTaskStatus, EscalationLevel } from '@/types/ar-collection';

interface StatusCellProps {
  /** 任务状态 */
  status: CollectionTaskStatus;
  /** 升级层级（仅在 escalated 状态时有效） */
  escalationLevel?: EscalationLevel;
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

const StatusCell: React.FC<StatusCellProps> = ({ status, escalationLevel }) => {
  // 升级状态根据层级区分显示
  if (status === 'escalated') {
    if (escalationLevel === 1) return <Tag color="red">升级至主管</Tag>;
    if (escalationLevel === 2) return <Tag color="volcano">升级至财务</Tag>;
    return <Tag color="red">已升级</Tag>;
  }

  const config = STATUS_CONFIG[status];
  if (!config) return <Tag>{status}</Tag>;
  return <Tag color={config.color}>{config.label}</Tag>;
};

export default StatusCell;
