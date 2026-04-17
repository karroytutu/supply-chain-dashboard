/**
 * 指标摘要卡片组件
 * 用于仪表盘顶部指标展示，支持趋势、统计、月度齐全率等模式
 */
import React, { useState } from 'react';
import type { MetricType, StrategicMonthlyAvailabilityData } from '@/types/dashboard';
import MonthlyAvailabilityModal from '@/components/MonthlyAvailabilityModal';
import TrendDisplay from './TrendDisplay';
import StatsDisplay from './StatsDisplay';
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
  trendDirection?: 'up' | 'down' | 'flat';
  // 是否为逆向指标（如周转天数，下降是好事）
  isInverseMetric?: boolean;
  // 辅助数据（如占比）
  auxiliaryData?: {
    label: string;
    value: number | string;
    unit?: string;
  };
  // 月度齐全率相关（仅 availability 类型使用）
  monthlyValue?: number;
  currentValue?: number;
  monthlyData?: StrategicMonthlyAvailabilityData;
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
  monthlyValue,
  currentValue,
  monthlyData,
}) => {
  const [modalVisible, setModalVisible] = useState(false);

  // 是否启用月度齐全率展示模式
  const isMonthlyMode = metricType === 'availability' && !!monthlyData && monthlyValue !== undefined;

  const handleCardClick = () => {
    if (isMonthlyMode) {
      setModalVisible(true);
    }
  };

  // 主显示值：月度模式显示月度平均值，否则显示原值
  const displayValue = isMonthlyMode ? monthlyValue : value;

  return (
    <div
      className={isMonthlyMode ? styles.summaryCardClickable : styles.summaryCard}
      onClick={handleCardClick}
    >
      <div className={styles.header}>
        <div className={styles.iconWrapper}>{icon}</div>
        <div className={styles.title}>{title}</div>
        {statusTag}
      </div>
      <div className={styles.body}>
        <div className={styles.valueWrapper}>
          <span className={styles.value}>{displayValue}</span>
          {unit && <span className={styles.unit}>{unit}</span>}
          {trend !== undefined && (
            <TrendDisplay
              trend={trend}
              trendDirection={trendDirection}
              isInverseMetric={isInverseMetric}
            />
          )}
        </div>
        <StatsDisplay
          isMonthlyMode={isMonthlyMode}
          currentValue={currentValue}
          totalSku={totalSku}
          outOfStock={outOfStock}
          previousValue={previousValue}
          value={value}
          unit={unit}
          isInverseMetric={isInverseMetric}
          auxiliaryData={auxiliaryData}
          period={period}
        />
      </div>
      {/* 月度齐全率明细弹窗 */}
      <div onClick={(e) => e.stopPropagation()}>
        <MonthlyAvailabilityModal
          open={modalVisible}
          onClose={() => setModalVisible(false)}
          data={monthlyData || null}
        />
      </div>
    </div>
  );
};

export default SummaryCard;
