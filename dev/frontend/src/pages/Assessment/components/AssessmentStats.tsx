/**
 * 考核统计卡片组件
 */
import React from 'react';
import { Row, Col, Card, Statistic } from 'antd';

interface AssessmentStatsProps {
  stats: AssessmentStats;
  loading: boolean;
}

const AssessmentStatsCard: React.FC<AssessmentStatsProps> = ({ stats, loading }) => {
  const items = [
    {
      title: '总考核金额',
      value: stats.totalAmount,
      prefix: '¥',
      valueStyle: { color: '#f5222d', fontSize: 20 },
    },
    {
      title: '待处理(条)',
      value: stats.pendingCount,
      valueStyle: { fontSize: 20 },
    },
    {
      title: '待处理金额',
      value: stats.pendingAmount,
      prefix: '¥',
      valueStyle: { fontSize: 20 },
    },
    {
      title: '已处理(条)',
      value: stats.confirmedCount,
      valueStyle: { fontSize: 20 },
    },
    {
      title: '今日新增',
      value: stats.todayNew,
      valueStyle: { fontSize: 20 },
    },
    {
      title: '涉及人数',
      value: stats.involvedUsers,
      valueStyle: { fontSize: 20 },
    },
  ];

  return (
    <Row gutter={16}>
      {items.map((item) => (
        <Col span={4} key={item.title}>
          <Card size="small" className="stat-card" loading={loading}>
            <Statistic
              title={item.title}
              value={item.value}
              prefix={item.prefix}
              valueStyle={item.valueStyle}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

export default AssessmentStatsCard;
