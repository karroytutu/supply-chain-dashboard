/**
 * 维度分布条形图
 * 横向进度条展示渠道/片区分布
 */

import React from 'react';
import type { DimensionDistributionItem } from '@/types/sales-analysis';
import styles from './DimensionBarList.less';

interface DimensionBarListProps {
  items: DimensionDistributionItem[];
  color: string;
}

const DimensionBarList: React.FC<DimensionBarListProps> = ({ items, color }) => {
  return (
    <div className={styles.list}>
      {items.map((item) => (
        <div key={item.label} className={styles.row}>
          <span className={styles.label}>{item.label}</span>
          <div className={styles.bar}>
            <span style={{ width: `${item.percentage}%`, background: color }} />
          </div>
          <span className={styles.count}>{item.countLabel}</span>
        </div>
      ))}
    </div>
  );
};

export default DimensionBarList;
