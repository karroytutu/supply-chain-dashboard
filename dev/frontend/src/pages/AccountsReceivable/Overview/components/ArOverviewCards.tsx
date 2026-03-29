/**
 * 应收账款概览卡片组件
 * 展示4个核心指标：应收总额、逾期总额、逾期率、平均账龄
 * 优化PC端和移动端响应式布局
 */
import React from 'react';
import { Card, Row, Col } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import type { ArStats } from '@/types/accounts-receivable';
import styles from '../index.less';

interface Props {
  stats: ArStats;
}

// 格式化金额
const formatAmount = (value: number): string => {
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// 格式化百分比
// 注意：后端 overdueRate 已经是百分比数值（如 89.35 表示 89.35%），无需再乘100
const formatPercent = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

// 趋势指示器组件
const TrendIndicator: React.FC<{ value: number; isInverse?: boolean }> = ({ value, isInverse }) => {
  const isUp = value >= 0;
  // 逆向指标：上升为红色(不好)，下降为绿色(好)
  // 正向指标：上升为绿色(好)，下降为红色(不好)
  const isGood = isInverse ? !isUp : isUp;
  const className = isGood ? styles.down : styles.up;

  return (
    <span className={`${styles.trendIndicator} ${className}`}>
      {isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
};

// 卡片配置类型
interface CardConfig {
  title: string;
  value: number;
  formatter: (v: number) => string;
  trend: number;
  isInverse: boolean;
  color: string;
  bgColor: string;
  icon: string;
}

const ArOverviewCards: React.FC<Props> = ({ stats }) => {
  const cards: CardConfig[] = [
    {
      title: '应收总额',
      value: stats.totalAmount,
      formatter: formatAmount,
      trend: stats.totalAmountTrend,
      isInverse: false, // 正向指标
      color: '#cf1322', // 红色
      bgColor: 'linear-gradient(135deg, #fff1f0 0%, #ffffff 100%)',
      icon: '💰',
    },
    {
      title: '逾期总额',
      value: stats.overdueAmount,
      formatter: formatAmount,
      trend: stats.overdueAmountTrend,
      isInverse: true, // 逆向指标
      color: '#fa541c', // 橙红
      bgColor: 'linear-gradient(135deg, #fff7e6 0%, #ffffff 100%)',
      icon: '⚠️',
    },
    {
      title: '逾期率',
      value: stats.overdueRate,
      formatter: formatPercent,
      trend: stats.overdueRateTrend,
      isInverse: true, // 逆向指标
      color: '#faad14', // 黄色
      bgColor: 'linear-gradient(135deg, #fffbe6 0%, #ffffff 100%)',
      icon: '📊',
    },
    {
      title: '平均账龄',
      value: stats.avgAgingDays,
      formatter: (v: number) => `${v.toFixed(1)}天`,
      trend: stats.avgAgingDaysTrend,
      isInverse: true, // 逆向指标
      color: '#1890ff', // 蓝色
      bgColor: 'linear-gradient(135deg, #e6f7ff 0%, #ffffff 100%)',
      icon: '📅',
    },
  ];

  return (
    <Row gutter={[12, 12]} className={styles.cardsRow}>
      {cards.map((card, index) => (
        <Col xs={12} sm={12} md={6} key={index} className={styles.cardWrapper}>
          <Card
            className={styles.statisticCard}
            bordered={false}
            style={{ background: card.bgColor }}
          >
            <div className={styles.cardTitle}>
              <span className={styles.cardIcon}>{card.icon}</span>
              <span>{card.title}</span>
            </div>
            <div className={styles.statisticValue} style={{ color: card.color }}>
              {card.formatter(card.value)}
            </div>
            <div className={styles.trendRow}>
              <span className={styles.trendLabel}>环比上月</span>
              <TrendIndicator value={card.trend} isInverse={card.isInverse} />
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
};

export default ArOverviewCards;
