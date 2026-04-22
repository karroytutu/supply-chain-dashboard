/**
 * 催收状态标签组件
 * 根据任务状态显示对应颜色的标签
 * 升级状态根据层级区分显示，支持处理人信息提示
 */
import React from 'react';
import { Tag, Popover } from 'antd';
import type { CollectionTaskStatus, EscalationLevel } from '@/types/ar-collection';
import './StatusTag.less';

interface StatusTagProps {
  /** 任务状态 */
  status: CollectionTaskStatus;
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
const STATUS_CONFIG: Record<CollectionTaskStatus, { label: string; color: string }> = {
  collecting: { label: '催收中', color: 'blue' },
  difference_processing: { label: '差异处理', color: 'gold' },
  extension: { label: '延期中', color: 'purple' },
  escalated: { label: '已升级', color: 'red' },
  pending_verify: { label: '待核销', color: 'cyan' },
  verified: { label: '已核销', color: 'green' },
  closed: { label: '已关闭', color: 'default' },
};

/** 根据升级层级获取显示标签和颜色 */
function getEscalatedDisplay(escalationLevel?: EscalationLevel): { label: string; color: string } {
  if (escalationLevel === 1) return { label: '升级至主管', color: 'red' };
  if (escalationLevel === 2) return { label: '升级至财务', color: 'volcano' };
  return { label: '已升级', color: 'red' };
}

const StatusTag: React.FC<StatusTagProps> = ({
  status,
  escalationLevel,
  currentHandlerRole,
  showDetail = false,
}) => {
  const config = STATUS_CONFIG[status];
  if (!config) return <Tag>{status}</Tag>;

  const isEscalated = status === 'escalated';
  const isDifference = status === 'difference_processing';

  const handlerName = currentHandlerRole ? ROLE_NAMES[currentHandlerRole] : undefined;

  const levelConfig =
    isEscalated && escalationLevel !== undefined
      ? ESCALATION_LEVEL_CONFIG[escalationLevel]
      : null;

  // 升级状态根据层级区分显示
  const escalatedDisplay = isEscalated ? getEscalatedDisplay(escalationLevel) : null;
  const displayLabel = escalatedDisplay ? escalatedDisplay.label : config.label;
  const displayColor = escalatedDisplay ? escalatedDisplay.color : config.color;

  // 简单模式 (不显示详情)
  if (!showDetail) {
    return <Tag color={displayColor}>{displayLabel}</Tag>;
  }

  // 详细模式 (带 Popover)
  const popoverContent = (
    <div className="status-tag-popover">
      <div className="popover-item">
        <span className="popover-label">状态:</span>
        <span className="popover-value">{displayLabel}</span>
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
      <Tag color={displayColor}>
        {displayLabel}
        {isDifference && handlerName && (
          <span className="status-level-badge">财务处理中</span>
        )}
      </Tag>
    </Popover>
  );
};

export default StatusTag;
