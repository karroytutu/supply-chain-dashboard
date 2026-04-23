/**
 * 迷你趋势折线图
 * 用于指标卡内嵌的 sparkline 展示
 */

import React from 'react';
import { Line } from '@ant-design/charts';

interface SparklineChartProps {
  data: Array<{ date: string; value: number }>;
  color?: string;
  height?: number;
}

const SparklineChart: React.FC<SparklineChartProps> = ({
  data,
  color = '#1890ff',
  height = 40,
}) => {
  const safeData = Array.isArray(data) ? data : [];

  const config = {
    data: safeData,
    height,
    padding: [0, 0, 0, 0] as [number, number, number, number],
    xField: 'date',
    yField: 'value',
    smooth: true,
    color,
    lineStyle: { lineWidth: 2 },
    areaStyle: {
      fill: `l(90) 0:${color}40 1:${color}00`,
    },
    tooltip: false,
    axis: false,
    legend: false,
    animation: {
      appear: { animation: 'path-in', duration: 800 },
    },
  };

  return <Line {...config} />;
};

export default SparklineChart;
