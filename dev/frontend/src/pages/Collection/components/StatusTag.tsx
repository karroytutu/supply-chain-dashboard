/**
 * 催收状态标签组件
 * 根据任务状态显示对应颜色和图标的标签
 * 支持升级层级显示和处理人信息提示
 */
import React from 'react';
import { Tag, Popover, Space } from 'antd';
import {
  ClockCircleOutlined,
  WarningOutlined,
  HourglassOutlined,
  VerticalAlignTopOutlined,
  FileSearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { CollectionTaskStatus, EscalationLevel } from '@/types/ar-collection';
import './StatusTag.less';

interface StatusTagProps {
  /** 任务状态 */
  status: CollectionTaskStatus;
  /** 是否显示图标 */
  showIcon?: boolean;
  /** 升级层级 (仅在 escalated 状态时有效) */
  escalationLevel?: EscalationLevel;
  /** 当前处理人角色 */
  currentHandlerRole?: string;
  /** 是否显示详细信息 (层级/处理人) */
  showDetail?: boolean;
}

/** 升级层级配置 */
const ESCALATION_LEVEL_CONFIG: Record<number, { label: string; color: string }> = {
  0: { label: 'L0', color: 'orange' },
  1: { label: 'L1-营销主管', color: 'red' },
  2: { label: 'L2-财务', color: 'magenta' },
};

/** 角色名称映射 */
const ROLE_NAMES: Record<string, string> = {
  marketer: '营销师',
  marketing_manager: '营销主管',
  marketing_supervisor: '营销主管',
  current_accountant: '财务',
  finance_staff: '财务',
  cashier: '出纳',
};

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

const StatusTag: React.FC<StatusTagProps> = ({
  status,
  showIcon = true,
  escalationLevel,
  currentHandlerRole,
  showDetail = false,
}) => {
  const config = STATUS_CONFIG[status];
  if (!config) return <Tag>{status}</Tag>;

  // 是否是升级状态
  const isEscalated = status === 'escalated';
  // 是否是差异处理状态
  const isDifference = status === 'difference_processing';

  // 获取处理人名称
  const handlerName = currentHandlerRole ? ROLE_NAMES[currentHandlerRole] : undefined;

  // 获取升级层级配置
  const levelConfig =
    isEscalated && escalationLevel !== undefined
      ? ESCALATION_LEVEL_CONFIG[escalationLevel]
      : null;

  // 简单模式 (不显示详情)
  if (!showDetail) {
    return (
      <Tag color={config.color} icon={showIcon ? config.icon : undefined}>
        {config.label}
        {levelConfig && <span className="status-level-badge">{levelConfig.label}</span>}
      </Tag>
    );
  }

  // 详细模式 (带 Popover)
  const popoverContent = (
    <div className="status-tag-popover">
      <div className="popover-item">
        <span className="popover-label">状态:</span>
        <span className="popover-value">{config.label}</span>
      </div>
      {isEscalated && levelConfig && (
        <div className="popover-item">
          <span className="popover-label">升级层级:</span>
          <span className="popover-value">{levelConfig.label}</span>
        </div>
      )}
      {handlerName && (
        <div className="popover-item">
          <span className="popover-label">处理人:</span>
          <span className="popover-value">{handlerName}</span>
        </div>
      )}
      {isDifference && (
        <div className="popover-item">
          <span className="popover-label">说明:</span>
          <span className="popover-value">往来会计处理差异中</span>
        </div>
      )}
    </div>
  );

  return (
    <Popover content={popoverContent} trigger="hover" placement="top">
      <Tag color={config.color} icon={showIcon ? config.icon : undefined}>
        {config.label}
        {levelConfig && <span className="status-level-badge">{levelConfig.label}</span>}
        {isDifference && handlerName && (
          <span className="status-level-badge">财务处理中</span>
        )}
      </Tag>
    </Popover>
  );
};

export default StatusTag;
