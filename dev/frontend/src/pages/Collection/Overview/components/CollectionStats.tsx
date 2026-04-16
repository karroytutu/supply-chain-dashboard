/**
 * 催收统计指标卡组件
 * 显示4个指标卡: 催收中、等待结果、重点跟进、本月已收回
 */
import React from 'react';
import {
  PhoneOutlined,
  HourglassOutlined,
  AlertOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { Spin } from 'antd';
import type { CollectionStats as StatsType } from '@/types/ar-collection';

interface CollectionStatsProps {
  stats: StatsType | null;
  loading: boolean;
  activeMetric: string | null;
  onMetricClick: (metric: string) => void;
}

/** 指标卡配置 */
const METRIC_CARDS = [
  {
    key: 'collecting',
    label: '催收中',
    icon: <PhoneOutlined />,
    color: '#1890ff',
    field: 'collecting' as const,
  },
  {
    key: 'waiting',
    label: '等待结果',
    icon: <HourglassOutlined />,
    color: '#fa8c16',
    field: 'waiting' as const,
  },
  {
    key: 'attention',
    label: '重点跟进',
    icon: <AlertOutlined />,
    color: '#ff4d4f',
    field: 'attention' as const,
  },
  {
    key: 'collected',
    label: '本月已核销',
    icon: <CheckCircleOutlined />,
    color: '#52c41a',
    field: 'collected' as const,
  },
];

const CollectionStats: React.FC<CollectionStatsProps> = ({
  stats,
  loading,
  activeMetric,
  onMetricClick,
}) => {
  if (loading && !stats) {
    return (
      <div className="metric-cards">
        {METRIC_CARDS.map((card) => (
          <div key={card.key} className="metric-card">
            <Spin size="small" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="metric-cards">
      {METRIC_CARDS.map((card) => {
        const data = stats?.[card.field] ?? { count: 0, amount: 0 };
        const isActive = activeMetric === card.key;
        return (
          <div
            key={card.key}
            className={`metric-card ${isActive ? 'active' : ''}`}
            onClick={() => onMetricClick(card.key)}
          >
            <div className="metric-label">
              <span style={{ color: card.color, marginRight: 8 }}>
                {card.icon}
              </span>
              {card.label}
            </div>
            <div className="metric-count">{data.count}</div>
            <div className="metric-amount">
              ¥{data.amount.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CollectionStats;
