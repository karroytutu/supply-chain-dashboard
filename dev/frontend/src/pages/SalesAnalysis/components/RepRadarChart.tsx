/**
 * 多维能力画像雷达图
 */

import React from 'react';
import { Card as AntCard } from 'antd';
import { Radar } from '@ant-design/charts';
import styles from './RepRadarChart.less';

/** 雷达图维度定义 */
const RADAR_DIMENSIONS = [
  { dimension: '拜访量', current: 14, average: 12 },
  { dimension: '跟进量', current: 18, average: 15 },
  { dimension: '转化率', current: 8, average: 10 },
  { dimension: '回款率', current: 12, average: 11 },
  { dimension: '客单价', current: 15, average: 13 },
];

/** 将数据转为图表格式 */
const chartData = RADAR_DIMENSIONS.flatMap((item) => [
  { dimension: item.dimension, value: item.current, type: '当前业务员' },
  { dimension: item.dimension, value: item.average, type: '团队均值参考' },
]);

const RepRadarChart: React.FC = () => {
  const config = {
    data: chartData,
    height: 260,
    xField: 'dimension',
    yField: 'value',
    seriesField: 'type',
    color: ['#1677ff', '#faad14'],
    area: { opacity: 0.15 },
    line: { width: 2 },
    point: { size: 3 },
    xAxis: { line: null, tickLine: null },
    yAxis: { label: false, grid: { line: { style: { lineDash: [4, 4] } } } },
    legend: {
      position: 'bottom' as const,
    },
  };

  return (
    <AntCard className={styles.card} size="small" title={null}>
      <div className={styles.cardTitleRow}>
        <div>
          <h3 className={styles.cardTitle}>多维能力画像</h3>
          <p className={styles.cardSubtitle}>对比拜访量、跟进量、转化率等维度与团队均值。</p>
        </div>
      </div>
      <Radar {...config} />
    </AntCard>
  );
};

export default RepRadarChart;
