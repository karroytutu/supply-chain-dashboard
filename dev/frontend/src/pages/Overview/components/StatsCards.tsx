/**
 * 统计卡片组件
 */

import React from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import {
  AppstoreOutlined,
  StarOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  SwapOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { OverviewStats } from '@/types/overview';
import styles from './StatsCards.less';

interface StatsCardsProps {
  stats: OverviewStats | null;
}

/** 格式化金额 */
const formatAmount = (value: number): string => {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return value.toLocaleString();
};

/** 第一行统计卡片 */
const PrimaryStats: React.FC<{ stats: OverviewStats | null }> = ({ stats }) => (
  <Row gutter={[16, 16]}>
    <Col xs={24} sm={12} lg={6}>
      <Card className={styles.statCard}>
        <Statistic
          title="总SKU数"
          value={stats?.totalSku || 0}
          prefix={<AppstoreOutlined />}
          valueStyle={{ color: '#1890ff' }}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card className={styles.statCard}>
        <Statistic
          title="战略商品"
          value={stats?.strategicProductCount || 0}
          prefix={<StarOutlined />}
          valueStyle={{ color: '#722ed1' }}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card className={styles.statCard}>
        <Statistic
          title="预警商品"
          value={stats?.warningProductCount || 0}
          prefix={<WarningOutlined />}
          valueStyle={{ color: '#fa8c16' }}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={6}>
      <Card className={styles.statCard}>
        <Statistic
          title="临期商品"
          value={stats?.expiringProductCount || 0}
          prefix={<ClockCircleOutlined />}
          valueStyle={{ color: '#eb2f96' }}
        />
      </Card>
    </Col>
  </Row>
);

/** 第二行核心指标卡片 */
const SecondaryStats: React.FC<{ stats: OverviewStats | null }> = ({ stats }) => (
  <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
    <Col xs={24} sm={12} lg={8}>
      <Card className={styles.statCard}>
        <Statistic
          title="战略商品齐全率"
          value={stats?.availabilityRate || 0}
          suffix="%"
          prefix={<CheckCircleOutlined />}
          valueStyle={{ color: '#52c41a' }}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={8}>
      <Card className={styles.statCard}>
        <Statistic
          title="库存周转天数"
          value={stats?.turnoverDays || 0}
          suffix="天"
          prefix={<SwapOutlined />}
          valueStyle={{ color: '#13c2c2' }}
        />
      </Card>
    </Col>
    <Col xs={24} sm={12} lg={8}>
      <Card className={styles.statCard}>
        <Statistic
          title="临期商品金额"
          value={formatAmount(stats?.expiringCost || 0)}
          suffix="元"
          prefix={<WarningOutlined />}
          valueStyle={{ color: '#fa8c16' }}
        />
      </Card>
    </Col>
  </Row>
);

const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => (
  <>
    <PrimaryStats stats={stats} />
    <SecondaryStats stats={stats} />
  </>
);

export default StatsCards;
