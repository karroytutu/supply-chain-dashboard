/**
 * 经营全景板块
 * 6 个 KPI 卡片 + 迷你趋势线
 */
import React from 'react';
import { Progress, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import SparklineChart from './SparklineChart';
import { OVERVIEW_KPIS } from '@/constants/salesAnalysis';
import type { OverviewKPI } from '@/types/sales-analysis';
import { formatCompactAmount } from '../utils/analysis-helpers';
import styles from './OverviewSection.less';

const OverviewSection: React.FC = () => {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>经营全景</h2>
      <div className={styles.kpiGrid}>
        {OVERVIEW_KPIS.map((kpi) => (
          <KPICard key={kpi.key} data={kpi} />
        ))}
      </div>
    </section>
  );
};

interface KPICardProps {
  data: OverviewKPI;
}

const KPICard: React.FC<KPICardProps> = ({ data }) => {
  const isPositiveMom = data.isNegative
    ? data.momChange < 0
    : data.momChange > 0;

  const formattedValue = data.valueType === 'count'
    ? data.value.toLocaleString()
    : formatCompactAmount(data.value);

  const formattedAssist = data.assistValueType === 'percent'
    ? `${data.assistValue}%`
    : formatCompactAmount(data.assistValue);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.label}>{data.label}</span>
        <Tag
          color={isPositiveMom ? 'success' : 'error'}
          className={styles.momTag}
        >
          {isPositiveMom ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          {Math.abs(data.momChange)}%
        </Tag>
      </div>

      <div className={styles.value}>{formattedValue}</div>

      <div className={styles.assistRow}>
        <span className={styles.assistLabel}>{data.assistLabel}</span>
        <span className={styles.assistValue}>{formattedAssist}</span>
      </div>

      {data.key === 'sales' && (
        <Progress
          percent={data.assistValue}
          size="small"
          strokeColor="#1677ff"
          className={styles.progressBar}
          format={(pct) => `${pct}%`}
        />
      )}

      <SparklineChart
        data={data.sparkline}
        isNegative={!isPositiveMom}
        height={32}
      />
    </div>
  );
};

export default OverviewSection;
