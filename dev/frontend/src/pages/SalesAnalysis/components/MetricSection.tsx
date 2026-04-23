/**
 * 指标卡分组板块
 * 按"销售与回款"、"费用与利润"两组展示指标卡
 */

import React from 'react';
import MetricSparkCard from './MetricSparkCard';
import type { MetricSparkData } from '@/types/sales-analysis';
import styles from './MetricSection.less';

interface MetricSectionProps {
  title: string;
  metrics: MetricSparkData[];
  secondary?: boolean;
}

const MetricSection: React.FC<MetricSectionProps> = ({ title, metrics, secondary = false }) => {
  return (
    <section className={styles.section}>
      <h2 className={styles.groupTitle}>{title}</h2>
      <div className={styles.grid}>
        {metrics.map((metric) => (
          <MetricSparkCard key={metric.key} data={metric} secondary={secondary} />
        ))}
      </div>
    </section>
  );
};

export default MetricSection;
