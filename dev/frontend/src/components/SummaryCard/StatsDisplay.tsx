/**
 * 统计数据展示子组件
 * 用于 SummaryCard 中的辅助数据和统计信息显示
 */
import React from 'react';
import type { StrategicMonthlyAvailabilityData } from '@/types/dashboard';
import styles from './index.less';

interface AuxiliaryData {
  label: string;
  value: number | string;
  unit?: string;
}

interface StatsDisplayProps {
  /** 月度齐全率模式 */
  isMonthlyMode: boolean;
  /** 月度齐全率时的当前瞬时值 */
  currentValue?: number;
  /** 总SKU数 */
  totalSku?: number;
  /** 缺货SKU数 */
  outOfStock?: number;
  /** 上期值（用于环比对比） */
  previousValue?: number;
  /** 当前显示值 */
  value: number | string;
  /** 值的单位 */
  unit?: string;
  /** 是否为逆向指标 */
  isInverseMetric: boolean;
  /** 辅助数据（如占比） */
  auxiliaryData?: AuxiliaryData;
  /** 数据周期 */
  period?: {
    current: string;
    previous: string;
  };
}

const StatsDisplay: React.FC<StatsDisplayProps> = ({
  isMonthlyMode,
  currentValue,
  totalSku,
  outOfStock,
  previousValue,
  value,
  unit,
  isInverseMetric,
  auxiliaryData,
  period,
}) => {
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
      {renderPeriodComparison(value, previousValue, unit, isInverseMetric, period)}
    </div>
  );
};

/** 渲染环比对比 */
function renderPeriodComparison(
  value: number | string,
  previousValue: number | undefined,
  unit: string | undefined,
  isInverseMetric: boolean,
  period?: { current: string; previous: string },
) {
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
}

export default StatsDisplay;
