import React from 'react';
import { Line } from '@ant-design/charts';
import styles from './index.less';

interface TrendChartProps {
  data: Array<{ date: string; value: number }>;
  height?: number;
  color?: string;
  smooth?: boolean;
}

const TrendChart: React.FC<TrendChartProps> = ({
  data,
  height = 60,
  color = '#1890ff',
  smooth = true,
}) => {
  // 确保 data 是数组，否则使用空数组
  const safeData = Array.isArray(data) ? data : [];

  const config = {
    data: safeData,
    height,
    padding: [0, 0, 0, 0],
    xField: 'date',
    yField: 'value',
    smooth,
    color,
    lineStyle: {
      lineWidth: 2,
    },
    areaStyle: {
      fill: `l(90) 0:${color}40 1:${color}00`,
    },
    tooltip: false,
    axis: false,
    legend: false,
    animation: {
      appear: {
        animation: 'path-in',
        duration: 1000,
      },
    },
  };

  return (
    <div className={styles.trendChart}>
      <Line {...config} />
    </div>
  );
};

export default TrendChart;
