/**
 * 风险卡片
 * 展示红/黄/蓝三级风险客户概览
 */

import React from 'react';
import { Card, Tag } from 'antd';
import type { RiskCardData, RiskLevel } from '@/types/sales-analysis';
import styles from './RiskCard.less';

interface RiskCardProps {
  data: RiskCardData;
  onClick?: (level: RiskLevel) => void;
}

const RISK_CLASS_MAP: Record<RiskLevel, string> = {
  red: styles.riskRed,
  yellow: styles.riskYellow,
  blue: styles.riskBlue,
};

const RiskCard: React.FC<RiskCardProps> = ({ data, onClick }) => {
  return (
    <Card
      className={`${styles.card} ${RISK_CLASS_MAP[data.level]}`}
      size="small"
      hoverable
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(data.level)}
    >
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>{data.kicker}</div>
          <h3 className={styles.title}>{data.title}</h3>
        </div>
        <Tag color={data.tag.color}>{data.tag.text}</Tag>
      </div>
      <div className={styles.countRow}>
        <div className={styles.count}>{data.count}</div>
        <div className={styles.unit}>{data.unit}</div>
      </div>
      <div className={styles.caption}>{data.caption}</div>
      <div className={styles.meta}>
        {data.meta.map((item, idx) => (
          <div key={idx} className={styles.metaRow}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      <div className={styles.linkRow}>
        <span className={styles.link}>{data.linkText}</span>
        <span className={styles.linkHint}>{data.linkHint}</span>
      </div>
    </Card>
  );
};

export default RiskCard;
