/**
 * 象限卡片
 * 展示明星/流量/潜力/问题象限客户数据及维度分布
 */

import React from 'react';
import { Tag } from 'antd';
import DimensionBarList from './DimensionBarList';
import type { QuadrantCardData, DimensionDistributionItem } from '@/types/sales-analysis';
import styles from './QuadrantCard.less';

interface QuadrantCardProps {
  data: QuadrantCardData;
  dimensionItems: DimensionDistributionItem[];
  barColor: string;
  dimTitle: string;
}

const QuadrantCard: React.FC<QuadrantCardProps> = ({ data, dimensionItems, barColor, dimTitle }) => {
  const salesUp = data.salesLabel.includes('高于');
  const profitUp = data.profitLabel.includes('高于');

  return (
    <div className={`${styles.card} ${styles[data.key]}`}>
      <div className={styles.top}>
        <span className={styles.label}>{data.label}</span>
        <Tag color={data.tagColor}>{data.tagText}</Tag>
      </div>
      <strong className={styles.count}>{data.count}</strong>
      <div className={styles.foot}>
        <span>占比 {data.percentage}</span>
        <span>{data.strategy}</span>
      </div>
      <div className={styles.medianRow}>
        <span className={salesUp ? styles.up : styles.down}>
          {salesUp ? '↑' : '↓'} {data.salesLabel}
        </span>
        <span className={profitUp ? styles.up : styles.down}>
          {profitUp ? '↑' : '↓'} {data.profitLabel}
        </span>
      </div>
      <div className={styles.divider}>
        <div className={styles.dimTitle}>{dimTitle}</div>
        <DimensionBarList items={dimensionItems} color={barColor} />
      </div>
    </div>
  );
};

export default QuadrantCard;
