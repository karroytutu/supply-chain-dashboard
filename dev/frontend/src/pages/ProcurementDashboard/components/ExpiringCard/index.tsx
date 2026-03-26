import React from 'react';
import { AlertOutlined } from '@ant-design/icons';
import MetricCard from '@/components/MetricCard';
import WarningBadge from '@/components/WarningBadge';
import type { ExpiringData } from '@/types/dashboard';
import styles from './index.less';

interface ExpiringCardProps {
  data: ExpiringData;
  onDrillDown: () => void;
  loading?: boolean;
}

const ExpiringCard: React.FC<ExpiringCardProps> = ({
  data,
  onDrillDown,
  loading = false,
}) => {
  return (
    <MetricCard
      title="临期商品占比"
      icon={<AlertOutlined />}
      value={data.value}
      unit="%"
      trend={data.trend}
      trendDirection={data.trendDirection}
      loading={loading}
      onDrillDown={onDrillDown}
      extra={
        <WarningBadge
          level={data.warningLevel}
          type="expiring"
          showIcon={false}
        />
      }
    >
      <div className={styles.breakdownList}>
        {data.breakdown.map((item) => (
          <div key={item.level} className={styles.breakdownItem}>
            <div className={styles.levelIndicator}>
              <span
                className={styles.dot}
                style={{ backgroundColor: item.color }}
              />
              <span className={styles.label}>{item.label}</span>
            </div>
            <div className={styles.stats}>
              <span className={styles.count}>{item.count}件</span>
              <span className={styles.percentage}>{item.percentage}%</span>
            </div>
          </div>
        ))}
      </div>
    </MetricCard>
  );
};

export default ExpiringCard;
