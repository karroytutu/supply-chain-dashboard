/**
 * 近三个月个人趋势与团队均线
 */

import React from 'react';
import { Card as AntCard } from 'antd';
import { Line } from '@ant-design/charts';
import styles from './RepTrendChart.less';

/** 趋势数据 */
const TREND_DATA = [
  { month: '1月', value: 72, type: '张晨' },
  { month: '2月', value: 78, type: '张晨' },
  { month: '3月', value: 85, type: '张晨' },
  { month: '4月', value: 82, type: '张晨' },
  { month: '5月', value: 90, type: '张晨' },
  { month: '6月', value: 94, type: '张晨' },
  { month: '7月', value: 100, type: '张晨' },
  { month: '1月', value: 70, type: '团队均线' },
  { month: '2月', value: 74, type: '团队均线' },
  { month: '3月', value: 79, type: '团队均线' },
  { month: '4月', value: 81, type: '团队均线' },
  { month: '5月', value: 86, type: '团队均线' },
  { month: '6月', value: 89, type: '团队均线' },
  { month: '7月', value: 92, type: '团队均线' },
];

const RepTrendChart: React.FC = () => {
  const config = {
    data: TREND_DATA,
    height: 220,
    padding: [20, 20, 40, 40] as [number, number, number, number],
    xField: 'month',
    yField: 'value',
    seriesField: 'type',
    color: ['#1677ff', '#faad14'],
    smooth: true,
    lineStyle: { lineWidth: 2 },
    areaStyle: { opacity: 0.05 },
    point: { size: 3 },
    xAxis: { label: { autoRotate: false } },
    yAxis: { label: { formatter: (v: string) => `${v}%` } },
    legend: { position: 'bottom' as const },
  };

  return (
    <AntCard className={styles.card} size="small" title={null}>
      <div className={styles.cardTitleRow}>
        <div>
          <h3 className={styles.cardTitle}>近三个月个人趋势与团队均线</h3>
          <p className={styles.cardSubtitle}>帮助识别持续上升、下滑或波动过大的业务员。</p>
        </div>
      </div>
      <Line {...config} />
    </AntCard>
  );
};

export default RepTrendChart;
