/**
 * 问题诊断卡
 * 用卡片化方式聚焦个人短板
 */

import React from 'react';
import { Card } from 'antd';
import type { DiagnosisItem } from '@/types/sales-analysis';
import styles from './DiagnosisCard.less';

interface DiagnosisCardProps {
  data: DiagnosisItem[];
}

const DiagnosisCard: React.FC<DiagnosisCardProps> = ({ data }) => {
  return (
    <Card className={styles.card} size="small" title={null}>
      <div className={styles.cardTitleRow}>
        <div>
          <h3 className={styles.cardTitle}>问题诊断卡</h3>
          <p className={styles.cardSubtitle}>用卡片化方式聚焦个人短板，方便管理层安排帮扶动作。</p>
        </div>
      </div>
      <div className={styles.diagnosisList}>
        {data.map((item, idx) => (
          <div key={idx} className={styles.diagnosisItem}>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default DiagnosisCard;
