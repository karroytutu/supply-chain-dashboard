/**
 * 逾期前预警面板组件
 * 显示汇总统计卡片，点击后弹出明细弹窗
 * 3级预警：今日到期(0天)、高危(1-2天)、关注(3-5天)
 */
import React from 'react';
import { Tag } from 'antd';
import { WarningOutlined, RightOutlined } from '@ant-design/icons';
import type { WarningSummary, WarningLevel } from '@/types/ar-collection';
import './WarningPanel.less';

interface WarningPanelProps {
  summary: WarningSummary | null;
  onCardClick: (level: WarningLevel) => void;
}

const WarningPanel: React.FC<WarningPanelProps> = ({ summary, onCardClick }) => {
  if (!summary) return null;

  const formatAmount = (amount: number | undefined | null) => {
    const safeAmount = amount ?? 0;
    if (safeAmount >= 10000) {
      return `¥${(safeAmount / 10000).toFixed(1)}万`;
    }
    return `¥${safeAmount.toLocaleString()}`;
  };

  // 计算各级别的数量和金额
  const todayCount = summary.today.count;
  const todayAmount = summary.today.amount;
  const mediumCount = summary.within5Days.count;
  const mediumAmount = summary.within5Days.amount;

  return (
    <div className="warning-panel">
      <div className="warning-panel-header">
        <h3>
          <WarningOutlined style={{ color: '#faad14' }} />
          逾期前预警
        </h3>
        <span className="warning-tip">系统每日 20:00 自动检查并推送</span>
      </div>
      <div className="warning-cards">
        {/* 今日到期 */}
        <div
          className="warning-card warning-card--today"
          onClick={() => onCardClick('today')}
        >
          <div className="warning-card-label">
            <Tag color="red">今日到期</Tag>
            <span className="days-range">0天</span>
          </div>
          <div className="warning-card-content">
            <span className="warning-card-value">{todayCount}</span>
            <span className="warning-card-amount">{formatAmount(todayAmount)}</span>
          </div>
          <RightOutlined className="warning-card-arrow" />
        </div>
        {/* 高危预警 */}
        <div
          className="warning-card warning-card--high"
          onClick={() => onCardClick('high')}
        >
          <div className="warning-card-label">
            <Tag color="orange">高危</Tag>
            <span className="days-range">1-2天</span>
          </div>
          <div className="warning-card-content">
            <span className="warning-card-value">{summary.within2Days.count}</span>
            <span className="warning-card-amount">{formatAmount(summary.within2Days.amount)}</span>
          </div>
          <RightOutlined className="warning-card-arrow" />
        </div>
        {/* 关注预警 */}
        <div
          className="warning-card warning-card--medium"
          onClick={() => onCardClick('medium')}
        >
          <div className="warning-card-label">
            <Tag color="gold">关注</Tag>
            <span className="days-range">3-5天</span>
          </div>
          <div className="warning-card-content">
            <span className="warning-card-value">{mediumCount}</span>
            <span className="warning-card-amount">{formatAmount(mediumAmount)}</span>
          </div>
          <RightOutlined className="warning-card-arrow" />
        </div>
      </div>
    </div>
  );
};

export default WarningPanel;
