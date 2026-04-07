/**
 * 逾期统计卡片组
 * 展示4张统计卡片：逾期客户数、逾期总额、平均逾期天数、超时预警数
 */
import React from 'react';
import { Row, Col } from 'antd';
import {
  UserOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import SummaryCard from '@/components/SummaryCard';
import type { OverdueStatsResponse } from '@/types/accounts-receivable';
import styles from '../index.less';

interface OverdueStatsCardsProps {
  stats: OverdueStatsResponse | null;
  onTimeoutClick?: () => void;
}

const OverdueStatsCards: React.FC<OverdueStatsCardsProps> = ({
  stats,
  onTimeoutClick,
}) => {
  if (!stats) return null;

  return (
    <div className={styles.statsCardsContainer}>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} md={6}>
          <SummaryCard
            title="逾期客户数"
            icon={<UserOutlined />}
            value={stats.totalCustomerCount}
            unit="户"
            metricType="receivable"
          />
        </Col>
        <Col xs={12} sm={12} md={6}>
          <SummaryCard
            title="逾期总额"
            icon={<DollarOutlined />}
            value={stats.totalOverdueAmount}
            unit="元"
            metricType="receivable"
          />
        </Col>
        <Col xs={12} sm={12} md={6}>
          <SummaryCard
            title="平均逾期天数"
            icon={<ClockCircleOutlined />}
            value={stats.avgOverdueDays}
            unit="天"
            metricType="receivable"
            isInverseMetric={true}
          />
        </Col>
        <Col xs={12} sm={12} md={6}>
          <div
            className={styles.clickableCard}
            onClick={onTimeoutClick}
            role="button"
            tabIndex={0}
          >
            <SummaryCard
              title="超时预警数"
              icon={<WarningOutlined />}
              value={stats.timeoutWarningCount}
              unit="条"
              metricType="receivable"
              isInverseMetric={true}
            />
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default OverdueStatsCards;
