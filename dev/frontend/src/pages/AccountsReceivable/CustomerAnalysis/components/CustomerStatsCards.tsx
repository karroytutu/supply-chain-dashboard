/**
 * 客户逾期统计卡片组件
 * 展示逾期客户数、最大单客户欠款、新增逾期客户数(本周)
 */
import React from 'react';
import { Row, Col, Card, Statistic } from 'antd';
import { UserOutlined, DollarOutlined, RiseOutlined } from '@ant-design/icons';
import type { OverdueStatsResponse } from '@/types/accounts-receivable';
import styles from '../index.less';

interface CustomerStatsCardsProps {
  stats: OverdueStatsResponse | null;
  loading?: boolean;
}

const CustomerStatsCards: React.FC<CustomerStatsCardsProps> = ({ stats, loading }) => {
  // 计算最大单客户欠款（从等级分布中取最大值）
  const maxCustomerAmount = stats?.levelDistribution
    ? Math.max(
        stats.levelDistribution.light?.amount ?? 0,
        stats.levelDistribution.medium?.amount ?? 0,
        stats.levelDistribution.severe?.amount ?? 0
      )
    : 0;

  return (
    <div className={styles.statsCards}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card className={styles.statsCard} loading={loading}>
            <Statistic
              title="逾期客户数"
              value={stats?.totalCustomerCount ?? 0}
              suffix="家"
              prefix={<UserOutlined className={styles.statIcon} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className={styles.statsCard} loading={loading}>
            <Statistic
              title="最大单客户欠款"
              value={maxCustomerAmount}
              precision={2}
              suffix="元"
              prefix={<DollarOutlined className={styles.statIconDanger} />}
              valueStyle={{ color: '#cf1322', fontWeight: 600 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className={styles.statsCard} loading={loading}>
            <Statistic
              title="新增逾期客户(本周)"
              value={stats?.levelDistribution?.severe?.customerCount ?? 0}
              suffix="家"
              prefix={<RiseOutlined className={styles.statIconWarning} />}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default CustomerStatsCards;
