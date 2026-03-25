import React from 'react';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons';
import type { MetricType, TrendDirection } from '@/types/dashboard';
import styles from './index.less';

interface SummaryCardProps {
  title: string;
  icon: React.ReactNode;
  value: number | string;
  unit?: string;
  statusTag?: React.ReactNode;
  metricType: MetricType;
  totalSku?: number;
  outOfStock?: number;
  // 环比数据
  previousValue?: number;
  period?: {
    current: string;
    previous: string;
  };
  trend?: number;
  trendDirection?: TrendDirection;
  // 是否为逆向指标（如周转天数，下降是好事）
  isInverseMetric?: boolean;
  // 辅助数据（如占比）
  auxiliaryData?: {
    label: string;
    value: number | string;
    unit?: string;
  };
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  icon,
  value,
  unit,
  statusTag,
  metricType,
  totalSku,
  outOfStock,
  previousValue,
  period,
  trend,
  trendDirection = 'flat',
  isInverseMetric = false,
  auxiliaryData,
}) => {
  const renderTrend = () => {
    if (trend === undefined || trend === 0) return null;
    
    // 逆向指标：下降是好事（绿色），上升是坏事（红色）
    // 正向指标：上升是好事（绿色），下降是坏事（红色）
    const isPositive = isInverseMetric ? trendDirection === 'down' : trendDirection === 'up';
    const trendColor = isPositive ? '#52c41a' : '#ff4d4f';
    const TrendIcon = trendDirection === 'up' ? ArrowUpOutlined : trendDirection === 'down' ? ArrowDownOutlined : MinusOutlined;
    
    return (
      <div className={styles.trendWrapper} style={{ color: trendColor }}>
        <TrendIcon />
        <span>{Math.abs(trend)}%</span>
      </div>
    );
  };

  const renderPeriodComparison = () => {
    if (previousValue === undefined || !period) return null;
    
    // 计算变动值
    const numericValue = typeof value === 'number' ? value : parseFloat(value);
    const changeValue = numericValue - previousValue;
    const changeDirection = changeValue > 0 ? 'up' : changeValue < 0 ? 'down' : 'flat';
    
    // 逆向指标：下降是好事（绿色），上升是坏事（红色）
    const isPositive = isInverseMetric ? changeDirection === 'down' : changeDirection === 'up';
    const changeColor = changeDirection === 'flat' ? '#8c8c8c' : (isPositive ? '#52c41a' : '#ff4d4f');
    
    return (
      <div className={styles.periodComparison}>
        <div className={styles.periodItem}>
          <span className={styles.periodLabel}>上月</span>
          <span className={styles.periodValue}>{previousValue}{unit}</span>
        </div>
        <div className={styles.periodItem}>
          <span className={styles.periodLabel}>变动</span>
          <span className={styles.periodValue} style={{ color: changeColor }}>
            {changeDirection === 'up' ? '+' : ''}{changeValue}{unit}
          </span>
        </div>
      </div>
    );
  };

  const renderStats = () => {
    if (totalSku === undefined && outOfStock === undefined && previousValue === undefined && !auxiliaryData) {
      return null;
    }

    return (
      <div className={styles.statsWrapper}>
        {auxiliaryData && (
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{auxiliaryData.label}</span>
            <span className={styles.statValue}>{auxiliaryData.value}{auxiliaryData.unit}</span>
          </div>
        )}
        {totalSku !== undefined && (
          <div className={styles.statItem}>
            <span className={styles.statLabel}>总SKU</span>
            <span className={styles.statValue}>{totalSku.toLocaleString()}</span>
          </div>
        )}
        {outOfStock !== undefined && (
          <div className={styles.statItem}>
            <span className={styles.statLabel}>缺货SKU</span>
            <span className={styles.statValue}>{outOfStock}</span>
          </div>
        )}
        {renderPeriodComparison()}
      </div>
    );
  };

  return (
    <div className={styles.summaryCard}>
      <div className={styles.header}>
        <div className={styles.iconWrapper}>{icon}</div>
        <div className={styles.title}>{title}</div>
        {statusTag}
      </div>
      <div className={styles.body}>
        <div className={styles.valueWrapper}>
          <span className={styles.value}>{value}</span>
          {unit && <span className={styles.unit}>{unit}</span>}
          {renderTrend()}
        </div>
        {renderStats()}
      </div>
    </div>
  );
};

export default SummaryCard;
