/**
 * 迷你趋势小圆柱图
 * 参考原型 sparkline 样式，以竖向小圆柱替代折线展示趋势
 */

import React from 'react';

interface SparklineChartProps {
  data: Array<{ date: string; value: number }>;
  color?: string;
  height?: number;
  isNegative?: boolean;
}

const SparklineChart: React.FC<SparklineChartProps> = ({
  data,
  color = '#b7d7f7',
  height = 36,
  isNegative = false,
}) => {
  const safeData = Array.isArray(data) ? data : [];
  if (safeData.length === 0) return null;

  const values = safeData.map((d) => d.value);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;

  const barColor = isNegative ? '#f3b7bd' : color;

  return (
    <div className="sparkline-bars" style={{ height, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
      {safeData.map((item, idx) => {
        const ratio = (item.value - minVal) / range;
        const barHeight = Math.max(6, ratio * (height - 4) + 4);
        return (
          <span
            key={idx}
            title={`${item.date}：${item.value.toLocaleString()}`}
            style={{
              flex: 1,
              minHeight: 6,
              height: barHeight,
              background: barColor,
              borderRadius: '999px 999px 0 0',
              transition: 'transform 0.15s ease, opacity 0.15s ease',
              cursor: 'pointer',
            }}
          />
        );
      })}
    </div>
  );
};

export default SparklineChart;
