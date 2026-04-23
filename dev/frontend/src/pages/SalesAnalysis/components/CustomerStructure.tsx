/**
 * 客户结构
 * 包含等级分布和类型分布两个子模块
 */

import React from 'react';
import { Card } from 'antd';
import GradeMiniCard from './GradeMiniCard';
import TypeDistribution from './TypeDistribution';
import type { GradeData, TypeDistributionItem } from '@/types/sales-analysis';
import styles from './CustomerStructure.less';

interface CustomerStructureProps {
  grades: GradeData[];
  typeDistribution: TypeDistributionItem[];
}

const CustomerStructure: React.FC<CustomerStructureProps> = ({ grades, typeDistribution }) => {
  return (
    <Card className={styles.card} size="small" title={null}>
      <div className={styles.cardTitleRow}>
        <div>
          <h3 className={styles.cardTitle}>客户结构</h3>
          <p className={styles.cardSubtitle}>
            辅助判断客户池是否健康，以及风险是否集中在某类客户上。
          </p>
          <p className={styles.cardInsight}>
            我的客户里 A/B 类占比较高，当前预警主要集中在便利店和商超，适合优先做重点维护。
          </p>
        </div>
      </div>
      <div className={styles.structure}>
        <div className={styles.subsection}>
          <div className={styles.subtitle}>客户等级分布</div>
          <div className={styles.metaGrid}>
            {grades.map((grade) => (
              <GradeMiniCard key={grade.label} data={grade} />
            ))}
          </div>
        </div>
        <div className={styles.subsection}>
          <div className={styles.subtitle}>客户类型分布</div>
          <TypeDistribution data={typeDistribution} />
        </div>
      </div>
    </Card>
  );
};

export default CustomerStructure;
