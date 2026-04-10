/**
 * 移动端任务卡片组件
 * 用于移动端替代表格展示任务列表
 */
import React from 'react';
import dayjs from 'dayjs';
import { Card, Button, Dropdown, Menu } from 'antd';
import {
  DollarOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  ArrowUpOutlined,
  DownOutlined,
  UserOutlined,
} from '@ant-design/icons';
import StatusCell from '../../components/StatusCell';
import type { CollectionTask } from '@/types/ar-collection';

interface TaskCardProps {
  task: CollectionTask;
  onAction: (action: string, task: CollectionTask) => void;
  onViewDetail: (id: number) => void;
  canWrite: boolean;
  canEscalate: boolean;
  canVerify: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onAction,
  onViewDetail,
  canWrite,
  canEscalate,
  canVerify,
}) => {
  // 判断操作权限
  const canTaskWrite = canWrite && !['verified', 'closed'].includes(task.status);
  const canTaskEscalate =
    canEscalate &&
    !['verified', 'closed'].includes(task.status) &&
    !(task.status === 'escalated' && task.escalationLevel === 2);
  const canTaskConfirm = task.status === 'pending_verify' && canVerify;

  /** 操作菜单 */
  const getActionMenu = () => {
    const items: { key: string; label: string; icon: React.ReactNode; danger?: boolean }[] = [];

    if (canTaskConfirm) {
      items.push({ key: 'confirmVerify', label: '确认核销', icon: <DollarOutlined /> });
    }
    if (canTaskWrite && task.status !== 'pending_verify') {
      items.push({ key: 'verify', label: '核销回款', icon: <DollarOutlined /> });
    }
    if (canTaskWrite && task.status !== 'pending_verify' && task.canExtend !== false) {
      items.push({ key: 'extension', label: '申请延期', icon: <ClockCircleOutlined /> });
    }
    if (canTaskWrite && task.status !== 'pending_verify') {
      items.push({ key: 'difference', label: '标记差异', icon: <ExclamationCircleOutlined /> });
    }
    if (canTaskEscalate && task.status !== 'pending_verify') {
      items.push({ key: 'escalate', label: '升级处理', icon: <ArrowUpOutlined />, danger: true });
    }

    return (
      <Menu
        onClick={({ key }) => onAction(key, task)}
        items={items}
      />
    );
  };

  return (
    <Card className="task-card" size="small">
      <div className="task-card-header">
        <a
          className="task-card-no task-card-no-link"
          onClick={() => onViewDetail(task.id)}
        >
          {task.taskNo}
        </a>
        <StatusCell status={task.status} priority={task.priority} compact />
      </div>

      <div className="task-card-body">
        <div className="customer-name">{task.consumerName}</div>
        <div className="task-meta">
          <span className="created-time">{formatDate(task.createdAt)}</span>
          <span className="separator">·</span>
          <span className="amount">¥{Number(task.totalAmount).toLocaleString()}</span>
          <span className="separator">·</span>
          <span className={task.maxOverdueDays >= 30 ? 'overdue-days danger' : 'overdue-days'}>
            逾期 {task.maxOverdueDays} 天
          </span>
        </div>
        {task.currentHandlerName && (
          <div className="handler-info">
            <UserOutlined /> {task.currentHandlerName}
          </div>
        )}
      </div>

      <div className="task-card-actions">
        <Dropdown overlay={getActionMenu()} trigger={['click']}>
          <Button size="small">
            操作 <DownOutlined />
          </Button>
        </Dropdown>
      </div>
    </Card>
  );
};

/** 格式化日期 */
function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return dayjs(dateStr).format('MM-DD');
}

export default TaskCard;
