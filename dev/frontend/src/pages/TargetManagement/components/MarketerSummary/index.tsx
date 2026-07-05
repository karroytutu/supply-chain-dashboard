/**
 * 营销师摘要栏（编辑模式下显示）
 * 展示当前营销师姓名 + 当月目标 + 上月达成 + 增长率
 */
import React from 'react';
import type { MarketerOverview } from '@/services/api/sales-target';
import { formatCompactAmount, formatGrowthRate } from '@/utils/format';
import styles from './index.less';

interface MarketerSummaryProps {
  marketer: MarketerOverview;
}

const MarketerSummary: React.FC<MarketerSummaryProps> = ({ marketer }) => {
  const growth = formatGrowthRate(marketer.growthRate);
  const growthClassName = growth.sign === 'positive' ? styles.positive : growth.sign === 'negative' ? styles.negative : '';

  return (
    <div className={styles.bar}>
      <span className={styles.name}>{marketer.name}</span>
      <span className={styles.divider}>·</span>
      <span className={styles.item}>
        当月目标 <strong>{formatCompactAmount(marketer.targetAmount)}</strong>
      </span>
      <span className={styles.divider}>·</span>
      <span className={styles.item}>
        上月达成 <strong>{formatCompactAmount(marketer.lastMonthActual)}</strong>
      </span>
      <span className={styles.divider}>·</span>
      <span className={styles.item}>
        增长 <strong className={growthClassName}>{growth.text}</strong>
      </span>
      <span className={styles.divider}>·</span>
      <span className={styles.item}>
        预计毛利 <strong>{formatCompactAmount(marketer.estimatedGrossProfit)}</strong>
      </span>
      <span className={styles.divider}>·</span>
      <span className={styles.item}>
        基准提成 <strong>{formatCompactAmount(marketer.baseCommission)}</strong>
      </span>
      <span className={styles.divider}>·</span>
      <span className={styles.item}>
        增量提成 <strong>{formatCompactAmount(marketer.incrementCommission)}</strong>
      </span>
    </div>
  );
};

export default React.memo(MarketerSummary);
