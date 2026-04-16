/**
 * 催收流程进度组件
 * 可视化展示任务状态流转路径，标注当前节点
 */
import React, { useMemo } from 'react';
import { Steps, Tooltip, ConfigProvider } from 'antd';
import {
  ClockCircleOutlined,
  PauseCircleOutlined,
  VerticalAlignTopOutlined,
  FileSearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { CollectionTaskStatus, EscalationLevel } from '@/types/ar-collection';
import './FlowProgress.less';

interface FlowProgressProps {
  /** 任务状态 */
  status: CollectionTaskStatus;
  /** 升级层级 (仅在 escalated 状态时有效) */
  escalationLevel?: EscalationLevel;
  /** 当前处理人角色 */
  currentHandlerRole?: string;
  /** 紧凑模式 (移动端) */
  compact?: boolean;
}

/** 主流程步骤配置 */
const MAIN_STEPS = [
  {
    key: 'collecting',
    title: '催收中',
    icon: <ClockCircleOutlined />,
    description: '营销师处理',
  },
  {
    key: 'extension',
    title: '延期中',
    icon: <PauseCircleOutlined />,
    description: '等待到期',
  },
  {
    key: 'escalated',
    title: '已升级',
    icon: <VerticalAlignTopOutlined />,
    description: '上级处理',
  },
  {
    key: 'pending_verify',
    title: '待核销',
    icon: <FileSearchOutlined />,
    description: '出纳确认',
  },
  {
    key: 'verified',
    title: '已核销',
    icon: <CheckCircleOutlined />,
    description: '任务完成',
  },
];

/** 升级层级配置 */
const ESCALATION_LEVELS = [
  { level: 0, title: '营销师', role: 'marketer' },
  { level: 1, title: '营销主管', role: 'marketing_manager' },
  { level: 2, title: '财务', role: 'current_accountant' },
];

/** 角色映射 */
const ROLE_NAMES: Record<string, string> = {
  marketer: '营销师',
  marketing_manager: '营销主管',
  marketing_supervisor: '营销主管',
  current_accountant: '财务',
  finance_staff: '财务',
  cashier: '出纳',
};

/** 状态到步骤索引的映射 */
const STATUS_TO_STEP: Record<string, number> = {
  collecting: 0,
  extension: 1,
  escalated: 2,
  pending_verify: 3,
  verified: 4,
  closed: 4, // 关闭状态也指向最后一个节点
};

/**
 * 获取当前状态的描述文本
 */
const getStatusDescription = (
  status: CollectionTaskStatus,
  escalationLevel?: EscalationLevel,
  currentHandlerRole?: string
): string => {
  if (status === 'escalated' && escalationLevel !== undefined) {
    const levelConfig = ESCALATION_LEVELS.find((l) => l.level === escalationLevel);
    return levelConfig ? `${levelConfig.title}处理中` : '处理中';
  }

  if (status === 'difference_processing') {
    return '财务处理差异中';
  }

  if (currentHandlerRole) {
    return `${ROLE_NAMES[currentHandlerRole] || currentHandlerRole}处理中`;
  }

  const step = MAIN_STEPS.find((s) => s.key === status);
  return step?.description || '';
};

/**
 * 获取当前处理人
 */
const getCurrentHandler = (
  status: CollectionTaskStatus,
  escalationLevel?: EscalationLevel
): string => {
  switch (status) {
    case 'collecting':
    case 'extension':
      return '营销师';
    case 'escalated':
      if (escalationLevel === 1) return '营销主管';
      if (escalationLevel === 2) return '财务';
      return '营销师';
    case 'difference_processing':
      return '财务';
    case 'pending_verify':
      return '出纳';
    default:
      return '-';
  }
};

const FlowProgress: React.FC<FlowProgressProps> = ({
  status,
  escalationLevel = 0,
  currentHandlerRole,
  compact = false,
}) => {
  /** 计算当前主流程步骤 */
  const currentStep = useMemo(() => {
    // 差异处理是分支路径，特殊处理
    if (status === 'difference_processing') {
      return 2; // 指向"已升级"位置，但显示为差异处理
    }
    return STATUS_TO_STEP[status] ?? 0;
  }, [status]);

  /** 是否显示升级层级子进度 */
  const showEscalationProgress = status === 'escalated';

  /** 是否是差异处理状态 */
  const isDifferenceProcessing = status === 'difference_processing';

  /** 是否是已关闭状态 */
  const isClosed = status === 'closed';

  /** 当前处理人 */
  const currentHandler = getCurrentHandler(status, escalationLevel);

  /** 状态描述 */
  const statusDesc = getStatusDescription(status, escalationLevel, currentHandlerRole);

  return (
    <div className={`flow-progress ${compact ? 'flow-progress-compact' : ''}`}>
      {/* 主流程进度 */}
      <div className="flow-progress-main">
        <div className="flow-progress-title">
          <span className="title-icon">📍</span>
          <span className="title-text">催收进度</span>
        </div>

        <ConfigProvider
          theme={{
            token: {
              colorPrimary: '#1890ff',
            },
          }}
        >
          <Steps
            current={currentStep}
            size={compact ? 'small' : 'default'}
            direction={compact ? 'vertical' : 'horizontal'}
            items={MAIN_STEPS.map((step, index) => {
              // 差异处理状态特殊显示
              if (isDifferenceProcessing && index === 2) {
                return {
                  ...step,
                  title: '差异处理',
                  icon: <WarningOutlined />,
                  status: 'process' as const,
                  description: '财务处理中',
                };
              }

              // 已关闭状态
              if (isClosed && index === 4) {
                return {
                  ...step,
                  title: '已关闭',
                  icon: <CloseCircleOutlined />,
                  status: 'finish' as const,
                  description: '任务已关闭',
                };
              }

              return {
                ...step,
                status:
                  index < currentStep
                    ? ('finish' as const)
                    : index === currentStep
                      ? ('process' as const)
                      : ('wait' as const),
              };
            })}
          />
        </ConfigProvider>
      </div>

      {/* 升级层级子进度 */}
      {showEscalationProgress && (
        <div className="flow-progress-escalation">
          <div className="escalation-title">升级层级</div>
          <div className="escalation-steps">
            {ESCALATION_LEVELS.map((level) => (
              <Tooltip
                key={level.level}
                title={`${level.title}处理`}
                placement="top"
              >
                <div
                  className={`escalation-step ${
                    level.level < escalationLevel
                      ? 'finished'
                      : level.level === escalationLevel
                        ? 'current'
                        : 'pending'
                  }`}
                >
                  <div className="step-dot" />
                  <div className="step-label">{level.title}</div>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {/* 当前状态提示 */}
      <div className="flow-progress-status">
        <div className="status-item">
          <span className="status-label">当前状态:</span>
          <span className="status-value">
            {isDifferenceProcessing
              ? '差异处理'
              : status === 'closed'
                ? '已关闭'
                : MAIN_STEPS[currentStep]?.title || status}
            {showEscalationProgress && (
              <span className="status-level">
                (L{escalationLevel} - {ESCALATION_LEVELS.find((l) => l.level === escalationLevel)?.title})
              </span>
            )}
          </span>
        </div>
        <div className="status-item">
          <span className="status-label">处理人:</span>
          <span className="status-value handler">{currentHandler}</span>
        </div>
      </div>
    </div>
  );
};

export default FlowProgress;
