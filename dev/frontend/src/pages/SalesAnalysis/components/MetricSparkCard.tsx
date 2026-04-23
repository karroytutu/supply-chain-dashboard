/**
 * 带迷你趋势图的指标卡
 * 显示指标名、值、同比/环比变化和 sparkline
 */

import React from 'react';
import { Card } from 'antd';
import { CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';
import SparklineChart from './SparklineChart';
import type { MetricSparkData } from '@/types/sales-analysis';
import styles from './MetricSparkCard.less';

interface MetricSparkCardProps {
  data: MetricSparkData;
  secondary?: boolean;
}

/** 格式化金额 */
const formatValue = (value: number): string => {
  return `¥ ${value.toLocaleString()}`;
};

/** 渲染涨跌标识 */
const renderDelta = (change: number, isNegative: boolean) => {
  const isUp = change >= 0;
  const displayValue = `${isUp ? '+' : ''}${change}%`;
  const colorClass = isUp === !isNegative ? 'positive' : 'negative';

  return (
    <span className={`${styles.delta} ${styles[colorClass]}`}>
      {isUp ? <CaretUpOutlined /> : <CaretDownOutlined />}
      {displayValue}
    </span>
  );
};

const MetricSparkCard: React.FC<MetricSparkCardProps> = ({ data, secondary = false }) => {
  const sparkColor = data.isNegative ? '#ff4d4f' : '#1890ff';

  return (
    <Card
      className={`${styles.card} ${secondary ? styles.secondary : ''}`}
      size="small"
    >
      <div className={styles.label}>{data.label}</div>
      <div className={styles.value}>{formatValue(data.value)}</div>
      <div className={styles.footer}>
        <span className={styles.trend}>
          <span className={styles.trendLabel}>同比</span>
          {renderDelta(data.yoyChange, data.isNegative)}
        </span>
        <span className={styles.trend}>
          <span className={styles.trendLabel}>环比</span>
          {renderDelta(data.momChange, data.isNegative)}
        </span>
      </div>
      <div className={styles.sparkline}>
        <SparklineChart data={data.sparkline} color={sparkColor} height={36} />
      </div>
    </Card>
  );
};

export default MetricSparkCard;
