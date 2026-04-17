/**
 * 趋势指标展示子组件
 * 用于 SummaryCard 中的环比趋势显示
 */
import React from 'react';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons';
import type { TrendDirection } from '@/types/dashboard';
import styles from './index.less';

interface TrendDisplayProps {
  trend: number;
  trendDirection: TrendDirection;
  isInverseMetric: boolean;
}

const TrendDisplay: React.FC<TrendDisplayProps> = ({ trend, trendDirection, isInverseMetric }) => {
  if (trend === 0) return null;

  // 逆向指标：下降是好事（绿色），上升是坏事（红色）
  // 正向指标：上升是好事（绿色），下降是坏事（红色）
  const isPositive = isInverseMetric ? trendDirection === 'down' : trendDirection === 'up';
  const trendColor = isPositive ? '#52c41a' : '#ff4d4f';
  const TrendIcon = trendDirection === 'up'
    ? ArrowUpOutlined
    : trendDirection === 'down'
    ? ArrowDownOutlined
    : MinusOutlined;

  return (
    <div className={styles.trendWrapper} style={{ color: trendColor }}>
      <TrendIcon />
      <span>{Math.abs(trend)}%</span>
    </div>
  );
};

export default TrendDisplay;
