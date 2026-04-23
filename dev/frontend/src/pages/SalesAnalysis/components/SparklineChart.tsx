/**
 * 迷你趋势小圆柱图
 * 参考原型 sparkline 样式，以竖向小圆柱替代折线展示趋势
 * 支持 hover 上浮 + 浮动 tooltip 交互
 */

import React, { useState, useCallback } from 'react';
import styles from './SparklineChart.less';

interface SparklineChartProps {
  data: Array<{ date: string; value: number }>;
  color?: string;
  height?: number;
  isNegative?: boolean;
  label?: string;
}

const SparklineChart: React.FC<SparklineChartProps> = ({
  data,
  color = '#b7d7f7',
  height = 36,
  isNegative = false,
  label = '',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
    value: string;
  } | null>(null);

  const safeData = Array.isArray(data) ? data : [];
  if (safeData.length === 0) return null;

  const values = safeData.map((d) => d.value);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;

  const barColor = isNegative ? '#f3b7bd' : color;

  const handleMouseEnter = useCallback(
    (idx: number, item: { date: string; value: number }, e: React.MouseEvent) => {
      setHoveredIdx(idx);
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        text: label ? `${label} | ${item.date}` : item.date,
        value: `¥ ${item.value.toLocaleString()}`,
      });
    },
    [label],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTooltip((prev) =>
      prev ? { ...prev, x: e.clientX, y: e.clientY } : null,
    );
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredIdx(null);
    setTooltip(null);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.bars} style={{ height }}>
        {safeData.map((item, idx) => {
          const ratio = (item.value - minVal) / range;
          const barHeight = Math.max(6, ratio * (height - 4) + 4);
          const isHovered = hoveredIdx === idx;
          return (
            <span
              key={idx}
              className={`${styles.bar} ${isHovered ? styles.barHover : ''} ${isNegative ? styles.barDown : ''}`}
              style={{
                height: barHeight,
                background: barColor,
              }}
              onMouseEnter={(e) => handleMouseEnter(idx, item, e)}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />
          );
        })}
      </div>

      {tooltip && (
        <div
          className={styles.tooltip}
          style={{
            left: Math.max(8, Math.min(tooltip.x + 12, window.innerWidth - 140)),
            top: Math.max(8, tooltip.y - 60),
          }}
        >
          <div className={styles.tooltipLabel}>{tooltip.text}</div>
          <div className={styles.tooltipValue}>{tooltip.value}</div>
        </div>
      )}
    </div>
  );
};

export default SparklineChart;
