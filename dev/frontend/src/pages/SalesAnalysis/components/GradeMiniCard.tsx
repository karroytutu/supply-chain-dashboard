/**
 * 客户等级小卡片
 * 展示 A/B/C/沉睡客户等级分布
 */

import React from 'react';
import { Tag } from 'antd';
import type { GradeData } from '@/types/sales-analysis';
import styles from './GradeMiniCard.less';

interface GradeMiniCardProps {
  data: GradeData;
}

const GradeMiniCard: React.FC<GradeMiniCardProps> = ({ data }) => {
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <span className={styles.label}>{data.label}</span>
        <Tag color={data.tagColor}>{data.tagText}</Tag>
      </div>
      <strong className={styles.count}>{data.count}</strong>
      <div className={styles.foot}>
        <span>占比 {data.percentage}</span>
        <span>{data.strategy}</span>
      </div>
      <p className={styles.note}>{data.note}</p>
    </div>
  );
};

export default GradeMiniCard;
