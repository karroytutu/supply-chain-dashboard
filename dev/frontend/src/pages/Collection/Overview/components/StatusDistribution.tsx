/**
 * 状态分布环形图组件
 * 使用 SVG 实现环形图，显示各状态数量和占比
 * 优化：支持高亮状态与Tab联动
 */
import React from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { CollectionStats } from '@/types/ar-collection';

interface StatusDistributionProps {
  stats: CollectionStats | null;
  highlightedStatus?: string | null;
  onStatusClick: (status: string) => void;
  onRefresh?: () => void;
}

/** 状态颜色配置 */
const STATUS_COLORS: Record<string, { color: string; label: string }> = {
  collecting: { color: '#1890ff', label: '催收中' },
  extension: { color: '#722ed1', label: '延期' },
  difference_processing: { color: '#faad14', label: '差异' },
  escalated: { color: '#ff4d4f', label: '已升级' },
  pending_verify: { color: '#13c2c2', label: '待核销' },
  verified: { color: '#52c41a', label: '已核销' },
};

const StatusDistribution: React.FC<StatusDistributionProps> = ({
  stats,
  highlightedStatus,
  onStatusClick,
  onRefresh,
}) => {
  const distribution = stats?.statusDistribution ?? [];
  const total = distribution.reduce((sum, d) => sum + d.count, 0);

  /** 计算 SVG 环形图参数 */
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const arcs = distribution.map((item) => {
    const length = (item.percentage / 100) * circumference;
    const arc = { ...item, length, offset, color: STATUS_COLORS[item.status]?.color || '#d9d9d9' };
    offset -= length;
    return arc;
  });

  return (
    <div className="chart-panel">
      <div className="chart-header">
        <h3>状态分布</h3>
        {onRefresh && (
          <Tooltip title="刷新数据">
            <ReloadOutlined
              className="refresh-icon"
              onClick={onRefresh}
            />
          </Tooltip>
        )}
      </div>
      <div className="donut-chart">
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#f0f0f0" strokeWidth="12" />
          {arcs.map((arc) => {
            const isHighlighted = highlightedStatus === arc.status;
            const isDimmed = highlightedStatus && !isHighlighted;
            return (
              <circle
                key={arc.status}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={isHighlighted ? 14 : 12}
                strokeDasharray={`${arc.length} ${circumference}`}
                strokeDashoffset={arc.offset}
                style={{
                  cursor: 'pointer',
                  opacity: isDimmed ? 0.3 : 1,
                  transition: 'all 0.3s ease',
                }}
                onClick={() => onStatusClick(arc.status)}
              />
            );
          })}
        </svg>
        <div className="donut-center">
          <div className="donut-total">{total}</div>
          <div className="donut-label">总任务</div>
        </div>
      </div>
      <div className="chart-legend">
        {distribution.map((item) => {
          const cfg = STATUS_COLORS[item.status];
          if (!cfg) return null;
          const isHighlighted = highlightedStatus === item.status;
          const isDimmed = highlightedStatus && !isHighlighted;
          return (
            <div
              key={item.status}
              className={`legend-item ${isHighlighted ? 'active' : ''}`}
              style={{ opacity: isDimmed ? 0.4 : 1 }}
              onClick={() => onStatusClick(item.status)}
            >
              <span className="legend-dot" style={{ background: cfg.color }} />
              <span>{cfg.label}</span>
              <span className="legend-count">{item.count}</span>
              <span className="legend-percent">{item.percentage}%</span>
            </div>
          );
        })}
      </div>
      <div className="chart-tip">点击扇区筛选</div>
    </div>
  );
};

export default StatusDistribution;
