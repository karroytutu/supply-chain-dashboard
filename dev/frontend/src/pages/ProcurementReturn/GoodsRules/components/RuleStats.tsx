/**
 * 商品退货规则统计卡片组件
 */
import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { GoodsReturnRuleStats } from '@/types/goods-return-rules';
import styles from '../index.less';

interface RuleStatsProps {
  stats: GoodsReturnRuleStats;
  activeFilter?: boolean;
  onFilterClick?: (canReturn: boolean | undefined) => void;
}

const RuleStats: React.FC<RuleStatsProps> = ({ stats, activeFilter, onFilterClick }) => {
  return (
    <Row gutter={[16, 16]} className={styles.statsRow}>
      <Col xs={12} sm={12} md={6}>
        <Card
          className={activeFilter === true ? styles.activeCard : styles.statCard}
          onClick={() => onFilterClick?.(activeFilter === true ? undefined : true)}
        >
          <Statistic
            title="可采购退货"
            value={stats.canReturn}
            prefix={<CheckCircleOutlined />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Card>
      </Col>
      <Col xs={12} sm={12} md={6}>
        <Card
          className={activeFilter === false ? styles.activeCard : styles.statCard}
          onClick={() => onFilterClick?.(activeFilter === false ? undefined : false)}
        >
          <Statistic
            title="不可采购退货"
            value={stats.cannotReturn}
            prefix={<CloseCircleOutlined />}
            valueStyle={{ color: '#ff4d4f' }}
          />
        </Card>
      </Col>
    </Row>
  );
};

export { RuleStats };
export default RuleStats;
