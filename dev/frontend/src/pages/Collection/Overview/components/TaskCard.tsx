/**
 * 移动端任务卡片组件
 * 用于移动端替代表格展示任务列表
 * 紧凑 2 行布局，整卡点击进入详情
 * 支持批量选择操作
 */
import React from 'react';
import dayjs from 'dayjs';
import { Card, Checkbox } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import StatusCell from '../../components/StatusCell';
import type { CollectionTask } from '@/types/ar-collection';

interface TaskCardProps {
  task: CollectionTask;
  onViewDetail: (id: number) => void;
  /** 是否选中（用于批量操作） */
  selected?: boolean;
  /** 选择回调 */
  onSelect?: (id: number, selected: boolean) => void;
  /** 是否可选择 */
  selectable?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onViewDetail,
  selected = false,
  onSelect,
  selectable = false,
}) => {
  /** 处理选择，阻止冒泡避免触发卡片点击 */
  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(task.id, !selected);
  };

  /** 键盘支持：Enter/Space 触发详情跳转 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onViewDetail(task.id);
    }
  };

  return (
    <Card
      className={`task-card ${selected ? 'task-card-selected' : ''}`}
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
          {selectable && (
            <Checkbox
              checked={selected}
              onClick={handleSelect}
              className="task-card-checkbox"
            />
          )}
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
