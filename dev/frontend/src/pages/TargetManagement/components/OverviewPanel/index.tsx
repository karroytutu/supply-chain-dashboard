/**
 * 概览视图面板
 * 展示全局概览（当月目标、上月达成、增长率、设置进度）+ 营销师明细表
 */
import React from 'react';
import { Tag } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { OverviewResponse, MarketerOverview } from '@/services/api/sales-target';
import { formatCompactAmount } from '@/utils/format';
import styles from './index.less';

interface OverviewPanelProps {
  data: OverviewResponse;
  onClickMarketer: (marketerId: number) => void;
}

/** 格式化增长率 */
function formatGrowthRate(rate: number | null): { text: string; color: string } {
  if (rate === null) return { text: '-', color: '#999' };
  const pct = (rate * 100).toFixed(1);
  if (rate > 0) return { text: `+${pct}%`, color: '#52c41a' };
  if (rate < 0) return { text: `${pct}%`, color: '#ff4d4f' };
  return { text: `${pct}%`, color: '#666' };
}

const OverviewPanel: React.FC<OverviewPanelProps> = ({ data, onClickMarketer }) => {
  const { summary, marketers } = data;
  const globalGrowth = formatGrowthRate(summary.growthRate);

  return (
    <div className={styles.panel}>
      {/* 总览卡片 */}
      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>当月目标总额</span>
          <span className={styles.summaryValue}>
            {summary.marketersWithTarget > 0 ? formatCompactAmount(summary.totalTarget) : '-'}
          </span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>上月实际达成</span>
          <span className={styles.summaryValue}>{formatCompactAmount(summary.totalLastMonthActual)}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>目标增长率</span>
          <span className={styles.summaryValue} style={{ color: globalGrowth.color }}>
            {globalGrowth.text}
          </span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>设置进度</span>
          <span className={styles.summaryValue}>
            {summary.marketersWithTarget}
            <span className={styles.summaryDivider}>/</span>
            {summary.marketerCount}
          </span>
        </div>
      </div>

      {/* 营销师明细表 */}
      <div className={styles.table}>
        <div className={styles.thead}>
          <span className={styles.colName}>营销师</span>
          <span className={styles.colNum}>当月目标</span>
          <span className={styles.colNum}>上月达成</span>
          <span className={styles.colNum}>增长率</span>
          <span className={styles.colStatus}>状态</span>
        </div>
        {marketers.map((m: MarketerOverview) => {
          const growth = formatGrowthRate(m.growthRate);
          return (
            <div
              key={m.id}
              className={styles.row}
              onClick={() => onClickMarketer(m.id)}
            >
              <span className={styles.colName}>
                <span className={styles.marketerName}>{m.name}</span>
                <span className={styles.customerCount}>{m.customerCount} 个客户</span>
              </span>
              <span className={styles.colNum}>
                {m.hasSaved ? formatCompactAmount(m.targetAmount) : '-'}
              </span>
              <span className={styles.colNum}>{formatCompactAmount(m.lastMonthActual)}</span>
              <span className={styles.colNum} style={{ color: growth.color }}>
                {growth.text}
              </span>
              <span className={styles.colStatus}>
                {m.hasSaved ? (
                  <Tag icon={<CheckCircleOutlined />} color="success">已设置</Tag>
                ) : (
                  <Tag icon={<ClockCircleOutlined />} color="warning">待设置</Tag>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(OverviewPanel);
