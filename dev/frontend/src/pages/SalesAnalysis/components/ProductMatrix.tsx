/**
 * 产品结构矩阵
 * 使用 Scatter 散点图展示销量-毛利率分布
 */

import React from 'react';
import { Card as AntCard } from 'antd';
import { Scatter } from '@ant-design/charts';
import type { MatrixProduct } from '@/types/sales-analysis';
import styles from './ProductMatrix.less';

interface ProductMatrixProps {
  data: MatrixProduct[];
}

/** 构建 scatter 图表配置 */
const buildChartConfig = (chartData: Array<{ name: string; volume: number; marginRate: number; color: string }>) => ({
  data: chartData,
  height: 240,
  padding: [20, 20, 40, 40] as [number, number, number, number],
  xField: 'volume',
  yField: 'marginRate',
  colorField: 'color',
  size: 8,
  shape: 'circle',
  tooltip: {
    fields: ['name', 'volume', 'marginRate'],
    formatter: (datum: Record<string, unknown>) => ({
      name: datum.name as string,
      value: `销量: ${datum.volume} | 毛利率: ${datum.marginRate}%`,
    }),
  },
  xAxis: { title: { text: '销量' }, min: 0, max: 100 },
  yAxis: { title: { text: '毛利率' }, min: 0, max: 100 },
  legend: false,
  pointStyle: { lineWidth: 0 },
  quadrant: {
    xBaseline: 50,
    yBaseline: 50,
    regionStyle: [
      { fill: 'rgba(255,255,255,0.02)' },
      { fill: 'rgba(255,255,255,0.02)' },
      { fill: 'rgba(255,255,255,0.02)' },
      { fill: 'rgba(255,255,255,0.02)' },
    ],
    labels: [
      { content: '低销量\n高毛利', position: 'leftTop' as const, style: { fill: '#999', fontSize: 11 } },
      { content: '明星区', position: 'rightTop' as const, style: { fill: '#999', fontSize: 11 } },
      { content: '低销量\n低毛利', position: 'leftBottom' as const, style: { fill: '#999', fontSize: 11 } },
      { content: '高销量\n低毛利', position: 'rightBottom' as const, style: { fill: '#999', fontSize: 11 } },
    ],
  },
  label: { content: 'name', position: 'top' as const, style: { fontSize: 11, fill: '#666' } },
});

const ProductMatrix: React.FC<ProductMatrixProps> = ({ data }) => {
  const chartData = data.map((item) => ({
    name: item.name, volume: item.volume, marginRate: item.marginRate, color: item.color,
  }));

  return (
    <AntCard className={styles.card} size="small" title={null}>
      <div className={styles.cardTitleRow}>
        <div>
          <h3 className={styles.cardTitle}>产品结构矩阵</h3>
          <p className={styles.cardSubtitle}>X 轴代表销量，Y 轴代表毛利率，用于区分明星产品和待优化产品。</p>
        </div>
      </div>
      <Scatter {...buildChartConfig(chartData)} />
    </AntCard>
  );
};

export default ProductMatrix;
