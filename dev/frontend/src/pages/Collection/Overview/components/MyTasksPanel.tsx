/**
 * 我的待办面板组件
 * 根据用户真实角色显示不同的待办卡片
 */
import React from 'react';
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
}

const ROLE_TASK_CARDS: Record<string, TaskCard[]> = {
  marketer: [
    { key: 'collecting', label: '催收中', icon: <PhoneOutlined />, urgent: true },
    { key: 'extension', label: '延期中', icon: <ClockCircleOutlined /> },
    { key: 'timeout', label: '超时未跟进', icon: <WarningOutlined />, urgent: true },
  ],
  supervisor: [
    { key: 'escalated', label: '待处理升级', icon: <RiseOutlined />, urgent: true },
    { key: 'todayDue', label: '今日到期', icon: <CalendarOutlined /> },
    { key: 'timeout', label: '超时未跟进', icon: <WarningOutlined /> },
  ],
  finance: [
    { key: 'difference', label: '差异待处理', icon: <ExclamationCircleOutlined />, urgent: true },
    { key: 'legal', label: '待法务处理', icon: <AuditOutlined /> },
    { key: 'notice', label: '待发催收函', icon: <MailOutlined /> },
  ],
  cashier: [
    { key: 'pending_verify', label: '待核销确认', icon: <FileTextOutlined />, urgent: true },
    { key: 'todaySubmit', label: '今日提交', icon: <CalendarOutlined /> },
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
          <div
            key={card.key}
            className={`task-type-card ${card.urgent ? 'urgent' : ''}`}
            onClick={() => onCardClick(card.key)}
          >
            <div className="type-header">
              <span className="type-icon">{card.icon}</span>
            </div>
            <div className="type-count">
              {getCardCount(card.key, myTasks)}
            </div>
            <div className="type-label">{card.label}</div>
            <div className="type-amount">
              ¥{formatAmount(getCardAmount(card.key, myTasks))}
            </div>
          </div>
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
function formatAmount(amount: number): string {
  if (amount >= 10000) {
    return (amount / 10000).toFixed(1) + '万';
  }
  return amount.toLocaleString();
}

export default MyTasksPanel;
