/**
 * 绩效统计卡片组件
 * 展示4个核心绩效指标
 */
import React from 'react';
import { Row, Col, Card } from 'antd';
import { FileTextOutlined, CheckCircleOutlined, ClockCircleOutlined, PercentageOutlined } from '@ant-design/icons';
import styles from '../index.less';

interface PerformanceCardsProps {
  totalTasks: number;
  completedTasks: number;
  avgCollectionHours: number;
  successRate: number;
}

interface MetricCardProps {
  title: string;
  icon: React.ReactNode;
  value: number;
  unit: string;
  color: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, icon, value, unit, color }) => (
  <Card className={styles.metricCard} bordered={false}>
    <div className={styles.metricIcon} style={{ backgroundColor: `${color}15`, color }}>
      {icon}
    </div>
    <div className={styles.metricContent}>
      <div className={styles.metricTitle}>{title}</div>
      <div className={styles.metricValue}>
        {(value ?? 0).toLocaleString()}
        <span className={styles.metricUnit}>{unit}</span>
      </div>
    </div>
  </Card>
);

const PerformanceCards: React.FC<PerformanceCardsProps> = ({
  totalTasks,
  completedTasks,
  avgCollectionHours,
  successRate,
}) => {
  return (
    <div className={styles.cardsSection}>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={12} md={6}>
          <MetricCard
            title="总催收任务数"
            icon={<FileTextOutlined />}
            value={totalTasks}
            unit="个"
            color="#1890ff"
          />
        </Col>
        <Col xs={12} sm={12} md={6}>
          <MetricCard
            title="已完成任务数"
            icon={<CheckCircleOutlined />}
            value={completedTasks}
            unit="个"
            color="#52c41a"
          />
        </Col>
        <Col xs={12} sm={12} md={6}>
          <MetricCard
            title="平均催收时长"
            icon={<ClockCircleOutlined />}
            value={avgCollectionHours}
            unit="小时"
            color="#faad14"
          />
        </Col>
        <Col xs={12} sm={12} md={6}>
          <MetricCard
            title="催收成功率"
            icon={<PercentageOutlined />}
            value={successRate}
            unit="%"
            color="#722ed1"
          />
        </Col>
      </Row>
    </div>
  );
};

export default PerformanceCards;
