/**
 * 任务详情 - 简洁头部
 * 显示返回按钮、客户名称、金额、逾期天数、状态、优先级
 */
import React from 'react';
import { Button, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { history } from 'umi';
import StatusTag from '../../components/StatusTag';
import PriorityBadge from '../../components/PriorityBadge';
import type { CollectionTask } from '@/types/ar-collection';

interface TaskHeaderProps {
  task: CollectionTask;
}

const TaskHeader: React.FC<TaskHeaderProps> = ({ task }) => {
  const handleBack = () => {
    if (window.history.length > 1) {
      history.back();
    } else {
      history.push('/collection/overview');
    }
  };

  return (
    <div className="task-detail-header">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={handleBack}
        className="back-btn"
      >
        返回
      </Button>
      <div className="header-info">
        <span className="consumer-name">{task.consumerName}</span>
        <span className="separator">·</span>
        <span className="amount">¥{task.totalAmount.toLocaleString()}</span>
        <span className="separator">·</span>
        <span className="overdue-days">逾期{task.maxOverdueDays}天</span>
      </div>
      <Space className="header-tags">
        <StatusTag
          status={task.status}
          escalationLevel={task.escalationLevel}
          currentHandlerRole={task.currentHandlerRole}
          showDetail
        />
        <PriorityBadge priority={task.priority} />
      </Space>
    </div>
  );
};

export default TaskHeader;
