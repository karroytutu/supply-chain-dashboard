import React from 'react';
import { BarChartOutlined } from '@ant-design/icons';
import MetricCard from '@/components/MetricCard';
import type { SlowMovingData } from '@/types/dashboard';
import styles from './index.less';

interface SlowMovingCardProps {
  data: SlowMovingData;
  onDrillDown: () => void;
  loading?: boolean;
}

const SlowMovingCard: React.FC<SlowMovingCardProps> = ({
  data,
  onDrillDown,
  loading = false,
}) => {
  const getBarColor = (range: string) => {
    if (range.includes('>30')) return '#ff4d4f';  // 严重滞销 - 红色
    if (range.includes('15-30')) return '#faad14';  // 中度滞销 - 橙色
    return '#fadb14';  // 轻度滞销 - 黄色
  };

  return (
    <MetricCard
      title="滞销商品占比"
      icon={<BarChartOutlined />}
      value={data.value}
      unit="%"
      trend={Math.abs(data.trend)}
      trendDirection={data.trendDirection}
      loading={loading}
      onDrillDown={onDrillDown}
    >
      <div className={styles.distributionList}>
        {data.distribution.map((item) => (
          <div key={item.range} className={styles.distributionItem}>
            <span className={styles.rangeLabel}>{item.label || item.range}</span>
            <div className={styles.barWrapper}>
              <div
                className={styles.bar}
                style={{
                  width: `${item.percentage}%`,
                  backgroundColor: getBarColor(item.range),
                }}
              />
            </div>
            <span className={styles.percentage}>{item.percentage}%</span>
          </div>
        ))}
      </div>
    </MetricCard>
  );
};

export default SlowMovingCard;
