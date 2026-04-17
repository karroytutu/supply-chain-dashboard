/**
 * 我的待办面板组件
 * 根据用户真实角色显示不同的待办卡片
 * 包含职责说明和快捷操作入口
 */
import React from 'react';
import { Tooltip, Button } from 'antd';
import {
  PhoneOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  RiseOutlined,
  CalendarOutlined,
  ExclamationCircleOutlined,
  AuditOutlined,
  FileTextOutlined,
  MailOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { RoleView } from '../hooks/useOverview';
import type { MyTasksSummary } from '@/types/ar-collection';

interface MyTasksPanelProps {
  userRole: RoleView;
  myTasks: MyTasksSummary | null;
  onCardClick: (filterType: string) => void;
}

/** 待办卡片配置(按角色) */
interface TaskCard {
  key: string;
  label: string;
  icon: React.ReactNode;
  urgent?: boolean;
  /** 卡片职责说明 */
  dutyDesc: string;
  /** 可执行操作 */
  actions?: string[];
}

const ROLE_TASK_CARDS: Record<string, TaskCard[]> = {
  marketer: [
    {
      key: 'collecting',
      label: '催收中',
      icon: <PhoneOutlined />,
      urgent: true,
      dutyDesc: '您负责的日常催收任务',
      actions: ['跟进催收', '核销回款'],
    },
    {
      key: 'extension',
      label: '延期中',
      icon: <ClockCircleOutlined />,
      dutyDesc: '延期等待到期的任务',
      actions: ['查看详情'],
    },
    {
      key: 'timeout',
      label: '超时未跟进',
      icon: <WarningOutlined />,
      urgent: true,
      dutyDesc: '超过7天未跟进的任务，需优先处理',
      actions: ['立即跟进', '升级处理'],
    },
  ],
  supervisor: [
    {
      key: 'escalated',
      label: '待处理升级',
      icon: <RiseOutlined />,
      urgent: true,
      dutyDesc: '营销师升级至您的任务',
      actions: ['处理升级', '核销回款'],
    },
    {
      key: 'todayDue',
      label: '今日到期',
      icon: <CalendarOutlined />,
      dutyDesc: '今日到期的任务，需关注处理',
      actions: ['查看详情'],
    },
    {
      key: 'timeout',
      label: '超时未跟进',
      icon: <WarningOutlined />,
      urgent: true,
      dutyDesc: '超过7天未跟进的任务',
      actions: ['立即跟进', '升级至财务'],
    },
  ],
  finance: [
    {
      key: 'difference',
      label: '差异待处理',
      icon: <ExclamationCircleOutlined />,
      urgent: true,
      dutyDesc: '营销标记的账务差异，需核对处理',
      actions: ['处理差异'],
    },
    {
      key: 'legal',
      label: '待法务处理',
      icon: <AuditOutlined />,
      dutyDesc: '升级至财务的任务，可发送催收函或起诉',
      actions: ['发送催收函', '提起诉讼'],
    },
    {
      key: 'notice',
      label: '待发催收函',
      icon: <MailOutlined />,
      dutyDesc: '需要发送催收函的任务',
      actions: ['发送函件'],
    },
  ],
  cashier: [
    {
      key: 'pending_verify',
      label: '待核销确认',
      icon: <FileTextOutlined />,
      urgent: true,
      dutyDesc: '营销提交的核销申请，需核实确认',
      actions: ['确认核销', '驳回核销'],
    },
    {
      key: 'todaySubmit',
      label: '今日提交',
      icon: <CalendarOutlined />,
      dutyDesc: '今日提交的核销申请',
      actions: ['查看详情'],
    },
  ],
};

const MyTasksPanel: React.FC<MyTasksPanelProps> = ({
  userRole,
  myTasks,
  onCardClick,
}) => {
  // 管理员不显示待办面板
  if (userRole === 'admin') return null;

  const cards = ROLE_TASK_CARDS[userRole] || [];
  const totalTasks = myTasks?.totalTasks ?? 0;
  const urgentCount = myTasks?.urgentCount ?? 0;

  return (
    <div className="my-tasks-panel">
      <div className="my-tasks-header">
        <h3>📋 我的待办</h3>
        <span className="task-count">
          {totalTasks} 件待处理{urgentCount > 0 && `（${urgentCount} 件紧急）`}
        </span>
      </div>
      <div className="my-tasks-content">
        {cards.map((card) => (
          <Tooltip
            key={card.key}
            title={
              <div className="task-card-tooltip">
                <div className="tooltip-title">{card.label}</div>
                <div className="tooltip-desc">{card.dutyDesc}</div>
                {card.actions && card.actions.length > 0 && (
                  <div className="tooltip-actions">
                    <span className="actions-label">可操作: </span>
                    {card.actions.join('、')}
                  </div>
                )}
              </div>
            }
            placement="top"
          >
            <div
              className={`task-type-card ${card.urgent ? 'urgent' : ''}`}
              onClick={() => onCardClick(card.key)}
            >
              <div className="type-header">
                <span className="type-icon">{card.icon}</span>
                {card.urgent && <span className="urgent-badge">紧急</span>}
              </div>
              <div className="type-count">
                {getCardCount(card.key, myTasks)}
              </div>
              <div className="type-label">{card.label}</div>
              <div className="type-amount">
                ¥{formatAmount(getCardAmount(card.key, myTasks))}
              </div>
              <div className="type-action-hint">
                点击查看
              </div>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};

/** 获取卡片数量(简化实现，使用 myTasks 汇总数据) */
function getCardCount(key: string, myTasks: MyTasksSummary | null): number {
  if (!myTasks) return 0;
  if (key === 'collecting') return myTasks.totalTasks;
  if (key === 'todayDue' || key === 'todaySubmit') return myTasks.todayDue;
  return myTasks.urgentCount;
}

/** 获取卡片金额 */
function getCardAmount(key: string, myTasks: MyTasksSummary | null): number {
  if (!myTasks) return 0;
  return myTasks.totalAmount;
}

/** 格式化金额 */
function formatAmount(amount: number | undefined | null): string {
  const safeAmount = amount ?? 0;
  if (safeAmount >= 10000) {
    return (safeAmount / 10000).toFixed(1) + '万';
  }
  return safeAmount.toLocaleString();
}

export default MyTasksPanel;
