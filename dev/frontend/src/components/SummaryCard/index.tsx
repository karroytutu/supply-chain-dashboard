import React, { useState } from 'react';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons';
import type { MetricType, TrendDirection, StrategicMonthlyAvailabilityData } from '@/types/dashboard';
import MonthlyAvailabilityModal from '@/components/MonthlyAvailabilityModal';
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
  trendDirection?: TrendDirection;
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
  const isMonthlyMode = metricType === 'availability' && monthlyData && monthlyValue !== undefined;

  const handleCardClick = () => {
    if (isMonthlyMode) {
      setModalVisible(true);
    }
  };

  const renderTrend = () => {
    if (trend === undefined || trend === 0) return null;
    
    // 逆向指标：下降是好事（绿色），上升是坏事（红色）
    // 正向指标：上升是好事（绿色），下降是坏事（红色）
    const isPositive = isInverseMetric ? trendDirection === 'down' : trendDirection === 'up';
    const trendColor = isPositive ? '#52c41a' : '#ff4d4f';
    const TrendIcon = trendDirection === 'up' ? ArrowUpOutlined : trendDirection === 'down' ? ArrowDownOutlined : MinusOutlined;
    
    return (
      <div className={styles.trendWrapper} style={{ color: trendColor }}>
        <TrendIcon />
        <span>{Math.abs(trend)}%</span>
      </div>
    );
  };

  const renderPeriodComparison = () => {
    if (previousValue === undefined || !period) return null;
    
    // 计算变动值
    const numericValue = typeof value === 'number' ? value : parseFloat(value);
    const changeValue = numericValue - previousValue;
    const changeDirection = changeValue > 0 ? 'up' : changeValue < 0 ? 'down' : 'flat';
    
    // 逆向指标：下降是好事（绿色），上升是坏事（红色）
    const isPositive = isInverseMetric ? changeDirection === 'down' : changeDirection === 'up';
    const changeColor = changeDirection === 'flat' ? '#8c8c8c' : (isPositive ? '#52c41a' : '#ff4d4f');
    
    return (
      <div className={styles.periodComparison}>
        <div className={styles.periodItem}>
          <span className={styles.periodLabel}>上月</span>
          <span className={styles.periodValue}>{previousValue}{unit}</span>
        </div>
        <div className={styles.periodItem}>
          <span className={styles.periodLabel}>变动</span>
          <span className={styles.periodValue} style={{ color: changeColor }}>
            {changeDirection === 'up' ? '+' : ''}{changeValue}{unit}
          </span>
        </div>
      </div>
    );
  };

  const renderStats = () => {
    // 月度齐全率模式：显示当前瞬时值
    if (isMonthlyMode && currentValue !== undefined) {
      return (
        <div className={styles.statsWrapper}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>当前</span>
            <span className={styles.statValue}>{currentValue}%</span>
          </div>
          {totalSku !== undefined && (
            <div className={styles.statItem}>
              <span className={styles.statLabel}>战略商品</span>
              <span className={styles.statValue}>{totalSku.toLocaleString()}个</span>
            </div>
          )}
        </div>
      );
    }

    if (totalSku === undefined && outOfStock === undefined && previousValue === undefined && !auxiliaryData) {
      return null;
    }

    return (
      <div className={styles.statsWrapper}>
        {auxiliaryData && (
          <div className={styles.statItem}>
            <span className={styles.statLabel}>{auxiliaryData.label}</span>
            <span className={styles.statValue}>{auxiliaryData.value}{auxiliaryData.unit}</span>
          </div>
        )}
        {totalSku !== undefined && (
          <div className={styles.statItem}>
            <span className={styles.statLabel}>总SKU</span>
            <span className={styles.statValue}>{totalSku.toLocaleString()}</span>
          </div>
        )}
        {outOfStock !== undefined && (
          <div className={styles.statItem}>
            <span className={styles.statLabel}>缺货SKU</span>
            <span className={styles.statValue}>{outOfStock}</span>
          </div>
        )}
        {renderPeriodComparison()}
      </div>
    );
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
          {renderTrend()}
        </div>
        {renderStats()}
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
