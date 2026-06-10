/**
 * KPI 指标卡片
 * 紧凑横向布局，支持可点击（如即将逾期弹窗）
 */

import React from 'react';
import { Card } from 'antd';
import styles from './index.less';

interface KpiCardProps {
  data: KpiCardData;
  onClick?: () => void;
}

/** 格式化金额：>= 1万显示 X.X万，null 显示 "--" */
const formatValue = (value: number | null, unit?: string): string | number => {
  if (value == null) return '--';
  if (unit === '元' && value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return value;
};

const KpiCard: React.FC<KpiCardProps> = ({ data, onClick }) => {
  const displayValue = formatValue(data.value, data.unit);
  const displayUnit = data.value != null && data.unit === '元' && data.value >= 10000 ? '元' : data.unit;
  const isClickable = !!onClick;

  return (
    <Card
      className={`${styles.card} ${isClickable ? styles.clickable : ''}`}
      bordered={false}
      onClick={onClick}
      size="small"
    >
      <div className={styles.inner}>
        <div className={styles.label}>{data.title}</div>
        <div className={styles.valueRow}>
          <span className={styles.value} style={{ color: data.valueColor }}>
            {displayValue}
          </span>
          {displayUnit && <span className={styles.unit}>{displayUnit}</span>}
        </div>
      </div>

      {/* 辅助信息（如即将逾期的笔数+金额） */}
      {data.auxiliary && data.auxiliary.length > 0 && (
        <div className={styles.auxiliary}>
          {data.auxiliary.map((item, idx) => (
            <span key={idx} className={styles.auxItem}>
              <span className={styles.auxLabel}>{item.label}：</span>
              <span className={styles.auxValue}>{item.value}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
};

export default KpiCard;
