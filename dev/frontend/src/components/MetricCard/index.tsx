import React from 'react';
import { Card } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons';
import type { TrendDirection } from '@/types/dashboard';
import { formatTrendDisplay } from '@/utils/calculation';
import styles from './index.less';

interface MetricCardProps {
  title: string;
  icon?: React.ReactNode;
  value: number | string;
  unit?: string;
  trend?: number;
  trendDirection?: TrendDirection;
  isInverseMetric?: boolean;
  extra?: React.ReactNode;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  loading?: boolean;
  className?: string;
  onDrillDown?: () => void;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  icon,
  value,
  unit,
  trend,
  trendDirection = 'flat',
  isInverseMetric = false,
  extra,
  footer,
  children,
  loading = false,
  className,
  onDrillDown,
}) => {
  const trendDisplay = trend !== undefined
    ? formatTrendDisplay(trend, trendDirection, isInverseMetric)
    : null;

  const renderTrendIcon = () => {
    if (trendDirection === 'up') {
      return <ArrowUpOutlined className={styles.trendArrow} />;
    }
    if (trendDirection === 'down') {
      return <ArrowDownOutlined className={styles.trendArrow} />;
    }
    return <MinusOutlined className={styles.trendArrow} />;
  };

  return (
    <Card
      className={`${styles.metricCard} ${className || ''}`}
      loading={loading}
      bordered={false}
    >
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <span className={styles.title}>{title}</span>
        </div>
        {extra && <div className={styles.extra}>{extra}</div>}
      </div>

      <div className={styles.content}>
        <div className={styles.valueWrapper}>
          <span className={styles.value}>{value}</span>
          {unit && <span className={styles.unit}>{unit}</span>}
        </div>

        {trendDisplay && (
          <div
            className={styles.trend}
            style={{ color: trendDisplay.color }}
          >
            {renderTrendIcon()}
            <span className={styles.trendText}>
              {trendDisplay.text} 较上月
            </span>
          </div>
        )}
      </div>

      {children && <div className={styles.body}>{children}</div>}

      {footer && (
        <div className={styles.footer}>
          {footer}
        </div>
      )}

      {onDrillDown && (
        <div className={styles.action}>
          <a onClick={onDrillDown}>查看品类明细 →</a>
        </div>
      )}
    </Card>
  );
};

export default MetricCard;
