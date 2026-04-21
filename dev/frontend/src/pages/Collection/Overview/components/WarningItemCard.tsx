/**
 * 移动端预警卡片组件
 * 用于移动端替代表格展示预警明细
 */
import React from 'react';
import { Card, Space, Typography, Divider, Tag } from 'antd';
import { ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import type { UpcomingWarning } from '@/types/ar-collection';

interface WarningItemCardProps {
  item: UpcomingWarning;
}

const { Text } = Typography;

const WarningItemCard: React.FC<WarningItemCardProps> = ({ item }) => {
  const formatAmount = (amount: number | undefined | null) => {
    const safeAmount = amount ?? 0;
    if (!safeAmount) return '¥0';
    return `¥${safeAmount.toLocaleString()}`;
  };

  return (
    <Card
      size="small"
      bordered
      style={{ borderLeft: '3px solid #faad14', marginBottom: 8 }}
      bodyStyle={{ padding: 12 }}
    >
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Text code copyable={{ text: item.billNo }}>
          {item.billNo}
        </Text>
        <Tag color={item.settleMethod === 2 ? 'blue' : 'green'}>
          {item.settleMethod === 2 ? '挂账' : '现款'}
        </Tag>
      </Space>

      <Text strong ellipsis style={{ display: 'block', marginTop: 8, marginBottom: 8 }}>
        {item.consumerName}
      </Text>

      <Space split={<Divider type="vertical" />} size={0} wrap>
        <Space size={4}>
          <UserOutlined />
          <Text type="secondary">{item.managerUserName || '-'}</Text>
        </Space>
        <Text type="danger" strong>
          {formatAmount(item.leftAmount)}
        </Text>
      </Space>

      <Space split={<Divider type="vertical" />} size={0} wrap style={{ marginTop: 4 }}>
        <Text type="secondary">到期: {item.expireDate}</Text>
        <Text type="danger">
          <ClockCircleOutlined /> 剩余{item.daysToExpire}天
        </Text>
        <Text type="secondary">
          {item.reminderCount > 0 ? `已提醒${item.reminderCount}次` : '未提醒'}
        </Text>
      </Space>
    </Card>
  );
};

export default WarningItemCard;
