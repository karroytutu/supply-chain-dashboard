/**
 * 任务详情 - 简洁头部
 * 显示返回按钮、客户名称、金额、逾期天数、状态
 * 移动端采用两行布局，PC端单行布局
 */
import React from 'react';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { history } from 'umi';
import StatusTag from '../../components/StatusTag';
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
      {/* 第一行：返回按钮 + 客户名称 */}
      <div className="header-row-main">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          className="back-btn"
        >
          返回
        </Button>
        <span className="consumer-name">{task.consumerName}</span>
      </div>

      {/* 第二行：金额、逾期天数、状态标签（移动端换行显示） */}
      <div className="header-row-sub">
        <div className="header-info">
          <span className="amount">¥{(task.totalAmount ?? 0).toLocaleString()}</span>
          <span className="separator">·</span>
          <span className="overdue-days">逾期{task.maxOverdueDays ?? 0}天</span>
        </div>
        <StatusTag
          status={task.status}
          escalationLevel={task.escalationLevel}
          currentHandlerRole={task.currentHandlerRole}
          showDetail
        />
      </div>
    </div>
  );
};

export default TaskHeader;
