/**
 * 客户结构
 * 按销量和毛利额四象限分类，支持渠道/片区维度切换
 */

import React, { useState } from 'react';
import { Card, Segmented } from 'antd';
import QuadrantCard from './QuadrantCard';
import type { CustomerQuadrantData, QuadrantKey, DimensionKey } from '@/types/sales-analysis';
import styles from './CustomerStructure.less';

const QUADRANT_KEYS: QuadrantKey[] = ['star', 'traffic', 'potential', 'problem'];

const QUADRANT_COLORS: Record<QuadrantKey, string> = {
  star: '#faad14',
  traffic: '#1890ff',
  potential: '#52c41a',
  problem: '#8c8c8c',
};

interface CustomerStructureProps {
  data: CustomerQuadrantData;
}

const CustomerStructure: React.FC<CustomerStructureProps> = ({ data }) => {
  const [dimension, setDimension] = useState<DimensionKey>('channel');

  const dimTitle = dimension === 'channel' ? '渠道分布' : '片区分布';

  return (
    <Card className={styles.card} size="small" title={null}>
      <div className={styles.cardTitleRow}>
        <div className={styles.titleLeft}>
          <h3 className={styles.cardTitle}>客户结构</h3>
        </div>
        <Segmented
          value={dimension}
          onChange={(v) => setDimension(v as DimensionKey)}
          options={[
            { label: '渠道', value: 'channel' },
            { label: '片区', value: 'district' },
          ]}
        />
      </div>
      <div className={styles.quadrantGrid}>
        {QUADRANT_KEYS.map((key) => (
          <QuadrantCard
            key={key}
            data={data.quadrants[key]}
            dimensionItems={data.dimensionData[dimension][key]}
            barColor={QUADRANT_COLORS[key]}
            dimTitle={dimTitle}
          />
        ))}
      </div>
      <div className={styles.bottomBar}>
        分界线：销量中位数 {data.salesMedian} 件/月 ｜ 毛利额中位数 ¥{data.profitMedian.toLocaleString()}/月。
        维度切换至「片区」可查看各象限客户的地域分布。
      </div>
    </Card>
  );
};

export default CustomerStructure;
