/**
 * 客户类型分布
 * 横向条形图展示各类客户占比
 */

import React from 'react';
import type { TypeDistributionItem } from '@/types/sales-analysis';
import styles from './TypeDistribution.less';

interface TypeDistributionProps {
  data: TypeDistributionItem[];
}

const TypeDistribution: React.FC<TypeDistributionProps> = ({ data }) => {
  return (
    <div className={styles.list}>
      {data.map((item) => (
        <div key={item.label} className={styles.row}>
          <span className={styles.label}>{item.label}</span>
          <div className={styles.bar}>
            <span style={{ width: `${item.percentage}%` }} />
          </div>
          <span className={styles.meta}>{item.countLabel}</span>
        </div>
      ))}
    </div>
  );
};

export default TypeDistribution;
