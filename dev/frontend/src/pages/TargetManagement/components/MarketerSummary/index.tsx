/**
 * 营销师摘要栏（编辑模式下显示）
 * 展示当前营销师姓名 + 当月目标 + 上月达成 + 增长率
 */
import React from 'react';
import type { MarketerOverview } from '@/services/api/sales-target';
import { formatCompactAmount } from '@/utils/format';
import styles from './index.less';

interface MarketerSummaryProps {
  marketer: MarketerOverview;
}

function formatGrowth(rate: number | null): { text: string; color: string } {
  if (rate === null) return { text: '-', color: '#666' };
  const pct = (rate * 100).toFixed(1);
  if (rate > 0) return { text: `+${pct}%`, color: '#52c41a' };
  if (rate < 0) return { text: `${pct}%`, color: '#ff4d4f' };
  return { text: `${pct}%`, color: '#666' };
}

const MarketerSummary: React.FC<MarketerSummaryProps> = ({ marketer }) => {
  const growth = formatGrowth(marketer.growthRate);

  return (
    <div className={styles.bar}>
      <span className={styles.name}>{marketer.name}</span>
      <span className={styles.divider}>·</span>
      <span className={styles.item}>
        当月目标 <strong>{marketer.hasSaved ? formatCompactAmount(marketer.targetAmount) : '-'}</strong>
      </span>
      <span className={styles.divider}>·</span>
      <span className={styles.item}>
        上月达成 <strong>{formatCompactAmount(marketer.lastMonthActual)}</strong>
      </span>
      <span className={styles.divider}>·</span>
      <span className={styles.item}>
        增长 <strong style={{ color: growth.color }}>{growth.text}</strong>
      </span>
    </div>
  );
};

export default React.memo(MarketerSummary);
