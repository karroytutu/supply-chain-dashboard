/**
 * 考核统计卡片组件
 */
import React from 'react';
import { Row, Col, Card, Spin } from 'antd';
import { DollarOutlined, TeamOutlined, ClockCircleOutlined } from '@ant-design/icons';
import styles from '../index.less';

interface PenaltyStatsCardsProps {
  totalAmount: number;
  userCount: number;
  pendingCount: number;
  loading?: boolean;
}

const PenaltyStatsCards: React.FC<PenaltyStatsCardsProps> = ({
  totalAmount,
  userCount,
  pendingCount,
  loading = false,
}) => {
  // 格式化金额
  const formatAmount = (amount: number) => {
    return `¥${amount.toLocaleString()}`;
  };

  const statsItems = [
    {
      key: 'totalAmount',
      icon: <DollarOutlined style={{ fontSize: 24, color: '#cf1322' }} />,
      value: formatAmount(totalAmount),
      label: '本月考核总额',
    },
    {
      key: 'userCount',
      icon: <TeamOutlined style={{ fontSize: 24, color: '#1890ff' }} />,
      value: `${userCount}人`,
      label: '涉及人员',
    },
    {
      key: 'pendingCount',
      icon: <ClockCircleOutlined style={{ fontSize: 24, color: '#faad14' }} />,
      value: `${pendingCount}条`,
      label: '待确认',
    },
  ];

  return (
    <Spin spinning={loading}>
      <Row gutter={16} className={styles.statsRow}>
        {statsItems.map((item) => (
          <Col xs={24} sm={8} md={8} key={item.key}>
            <Card className={styles.statsCard}>
              {item.icon}
              <div className={styles.statsValue}>{item.value}</div>
              <div className={styles.statsLabel}>{item.label}</div>
            </Card>
          </Col>
        ))}
      </Row>
    </Spin>
  );
};

export default PenaltyStatsCards;
