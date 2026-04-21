/**
 * 移动端任务卡片组件
 * 用于移动端替代表格展示任务列表
 * 紧凑 2 行布局，整卡点击进入详情
 */
import React from 'react';
import dayjs from 'dayjs';
import { Card } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import StatusCell from '../../components/StatusCell';
import type { CollectionTask } from '@/types/ar-collection';

interface TaskCardProps {
  task: CollectionTask;
  onViewDetail: (id: number) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onViewDetail,
}) => {
  /** 键盘支持：Enter/Space 触发详情跳转 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onViewDetail(task.id);
    }
  };

  return (
    <Card
      className="task-card"
      size="small"
      onClick={() => onViewDetail(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`逾期催收任务 ${task.taskNo}，${task.consumerName}，¥${Number(task.totalAmount).toLocaleString()}`}
    >
      {/* Row 1: 客户名称 + 状态 + 金额 */}
      <div className="task-card-row task-card-row--primary">
        <div className="task-card-left">
          <span className="customer-name">{task.consumerName}</span>
        </div>
        <div className="task-card-right">
          <StatusCell status={task.status} />
          <span className="amount">¥{Number(task.totalAmount).toLocaleString()}</span>
        </div>
      </div>

      {/* Row 2: 编号·日期·逾期天数 + 处理人 */}
      <div className="task-card-row task-card-row--secondary">
        <div className="task-card-left">
          <span className="task-no">{task.taskNo}</span>
          <span className="separator">·</span>
          <span className="created-time">{formatDate(task.createdAt)}</span>
          <span className="separator">·</span>
          <span className={task.maxOverdueDays >= 30 ? 'overdue-days danger' : 'overdue-days'}>
            逾期{task.maxOverdueDays}天
          </span>
        </div>
        {task.currentHandlerName && (
          <div className="task-card-right handler-info">
            <UserOutlined /> {task.currentHandlerName}
          </div>
        )}
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
