/**
 * 客户指标卡片
 * 展示拜访不足/订单下滑/品类不齐/公海客户概览，含环比趋势和上期对比
 * 视觉风格与 MetricSparkCard 保持一致
 */

import React from 'react';
import { Card } from 'antd';
import { CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';
import type { CustomerMetricData, CustomerMetricType } from '@/types/sales-analysis';
import styles from './CustomerMetricCard.less';

interface CustomerMetricCardProps {
  data: CustomerMetricData;
  onClick?: (metricType: CustomerMetricType) => void;
}

/** 判断环比趋势是否为正面（对业务有利） */
function isPositiveTrend(data: CustomerMetricData): boolean {
  const increasing = data.momChange > 0;
  return data.isNegative ? !increasing : increasing;
}

const CustomerMetricCard: React.FC<CustomerMetricCardProps> = ({ data, onClick }) => {
  const positive = isPositiveTrend(data);
  const isUp = data.momChange > 0;
  const change = data.count - data.previousCount;
  const changeText = change > 0 ? `+${change}` : change < 0 ? `${change}` : '0';

  return (
    <Card
      className={styles.card}
      size="small"
      hoverable
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(data.metricType)}
    >
      <div className={styles.label}>{data.title}</div>
      <div className={styles.value}>
        {data.count}
        <span className={styles.unit}>{data.unit}</span>
      </div>
      <div className={styles.footer}>
        <span className={styles.trend}>
          <span className={styles.trendLabel}>环比</span>
          <span className={`${styles.delta} ${positive ? styles.positive : styles.negative}`}>
            {isUp ? <CaretUpOutlined /> : <CaretDownOutlined />}
            {Math.abs(data.momChange)}%
          </span>
        </span>
        <span className={styles.trend}>
          <span className={styles.trendLabel}>上月</span>
          <span className={styles.previousValue}>{data.previousCount}{data.unit}</span>
        </span>
        <span className={styles.trend}>
          <span className={styles.trendLabel}>变动</span>
          <span className={`${styles.delta} ${positive ? styles.positive : styles.negative}`}>
            {changeText}
          </span>
        </span>
      </div>
    </Card>
  );
};

export default CustomerMetricCard;
