/**
 * 移动端任务卡片组件
 * 用于移动端替代表格展示任务列表
 * 紧凑 2 行布局，整卡点击进入详情
 */
import React from 'react';
import dayjs from 'dayjs';
import { Card, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import StatusCell from '../../components/StatusCell';
import { calcAssessmentTime } from './CollectionTable/utils';
import type { CollectionTask } from '@/types/ar-collection';
import type { AssessmentTier } from '@/types/ar-assessment';

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
          <StatusCell status={task.status} escalationLevel={task.escalationLevel} />
          <span className="amount">¥{Number(task.totalAmount).toLocaleString()}</span>
        </div>
      </div>

      {/* Row 2: 编号·日期·逾期天数·剩余时限·考核状态 + 处理人 */}
      <div className="task-card-row task-card-row--secondary">
        <div className="task-card-left">
          <span className="task-no">{task.taskNo}</span>
          <span className="separator">·</span>
          <span className="created-time">{formatDate(task.createdAt)}</span>
          <span className="separator">·</span>
          <span className={task.maxOverdueDays >= 30 ? 'overdue-days danger' : 'overdue-days'}>
            逾期{task.maxOverdueDays}天
          </span>
          {task.assessmentStartTime && (
            <>
              <span className="separator">·</span>
              <AssessmentDeadline startTime={task.assessmentStartTime} />
            </>
          )}
          {task.assessmentTiers && task.assessmentTiers.length > 0 && (
            <>
              <span className="separator">·</span>
              <AssessmentTags tiers={task.assessmentTiers} />
            </>
          )}
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

/** 移动端紧凑剩余时限 */
function AssessmentDeadline({ startTime }: { startTime: string }) {
  const { text, color } = calcAssessmentTime(startTime);
  const compact = text.replace('剩余 ', '剩').replace('超期 ', '超');
  return <span style={{ color, fontSize: 12 }}>{compact}</span>;
}

/** 移动端紧凑考核 Tag */
const TIER_COLORS: Record<AssessmentTier, string> = {
  tier1: 'processing',
  tier2: 'warning',
  tier3: 'error',
};

const TIER_LABELS: Record<AssessmentTier, string> = {
  tier1: '一级',
  tier2: '二级',
  tier3: '三级',
};

function AssessmentTags({ tiers }: { tiers: AssessmentTier[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {tiers.map((tier) => (
        <Tag key={tier} color={TIER_COLORS[tier]} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
          {TIER_LABELS[tier]}
        </Tag>
      ))}
    </span>
  );
}

export default TaskCard;
