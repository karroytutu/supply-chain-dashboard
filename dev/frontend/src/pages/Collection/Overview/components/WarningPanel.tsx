/**
 * 逾期前预警面板组件
 * 显示汇总统计卡片，点击后弹出明细弹窗
 * 3级预警：今日到期(0天)、高危(1-2天)、关注(3-5天)
 */
import React from 'react';
import { Card, Space, Typography, Row, Col, Tag, Button } from 'antd';
import { WarningOutlined, RightOutlined } from '@ant-design/icons';
import type { WarningSummary, WarningLevel } from '@/types/ar-collection';
import useMedia from '../hooks/useMedia';

interface WarningPanelProps {
  summary: WarningSummary | null;
  onCardClick: (level: WarningLevel) => void;
}

const { Title, Text } = Typography;

const WarningPanel: React.FC<WarningPanelProps> = ({ summary, onCardClick }) => {
  const { isMobile } = useMedia();

  if (!summary) return null;

  const formatAmount = (amount: number | undefined | null) => {
    const safeAmount = amount ?? 0;
    if (safeAmount >= 10000) {
      return `¥${(safeAmount / 10000).toFixed(1)}万`;
    }
    return `¥${safeAmount.toLocaleString()}`;
  };

  const cardData = [
    {
      level: 'today' as WarningLevel,
      tagColor: 'red',
      tagText: '今日到期',
      daysText: '0天',
      count: summary.today.count,
      amount: summary.today.amount,
      borderColor: '#ff4d4f',
    },
    {
      level: 'high' as WarningLevel,
      tagColor: 'orange',
      tagText: '高危',
      daysText: '1-2天',
      count: summary.within2Days.count,
      amount: summary.within2Days.amount,
      borderColor: '#fa8c16',
    },
    {
      level: 'medium' as WarningLevel,
      tagColor: 'gold',
      tagText: '关注',
      daysText: '3-5天',
      count: summary.within5Days.count,
      amount: summary.within5Days.amount,
      borderColor: '#faad14',
    },
  ];

  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      bodyStyle={{ padding: isMobile ? '12px 16px' : '16px 20px' }}
    >
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>
          <WarningOutlined style={{ color: '#faad14', marginRight: 6 }} />
          逾期前预警
        </Title>
        <Text type="secondary">系统每日 20:00 自动检查并推送</Text>
      </Space>

      <Row gutter={isMobile ? [8, 8] : [12, 12]}>
        {cardData.map((card) => (
          <Col xs={24} md={8} key={card.level}>
            <Card
              size="small"
              hoverable
              onClick={() => onCardClick(card.level)}
              style={{ borderLeft: `3px solid ${card.borderColor}` }}
              bodyStyle={{ padding: 12 }}
            >
              <Space
                style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Space direction="vertical" size={0}>
                  <Tag color={card.tagColor}>{card.tagText}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {card.daysText}
                  </Text>
                </Space>
                <Space align="baseline">
                  <Text strong style={{ fontSize: 20, color: card.borderColor }}>
                    {card.count}
                  </Text>
                  <Text type="secondary">{formatAmount(card.amount)}</Text>
                </Space>
                <Button
                  type="text"
                  icon={<RightOutlined />}
                  size="small"
                  style={{ color: 'rgba(0,0,0,0.25)' }}
                />
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </Card>
  );
};

export default WarningPanel;
