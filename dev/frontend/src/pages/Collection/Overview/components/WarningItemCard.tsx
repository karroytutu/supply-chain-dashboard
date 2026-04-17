/**
 * 移动端预警卡片组件
 * 用于移动端替代表格展示预警明细
 */
import React from 'react';
import { Tag } from 'antd';
import { ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import type { UpcomingWarning } from '@/types/ar-collection';
import './WarningItemCard.less';

interface WarningItemCardProps {
  item: UpcomingWarning;
}

const WarningItemCard: React.FC<WarningItemCardProps> = ({ item }) => {
  const formatAmount = (amount: number | undefined | null) => {
    const safeAmount = amount ?? 0;
    if (!safeAmount) return '¥0';
    return `¥${safeAmount.toLocaleString()}`;
  };

  return (
    <div className="warning-item-card">
      <div className="warning-item-card-header">
        <span className="warning-item-card-no">{item.billNo}</span>
        <Tag color={item.settleMethod === 2 ? 'blue' : 'green'}>
          {item.settleMethod === 2 ? '挂账' : '现款'}
        </Tag>
      </div>

      <div className="warning-item-card-body">
        <div className="customer-name">{item.consumerName}</div>
        <div className="meta-row">
          <span className="meta-item">
            <UserOutlined /> {item.managerUserName || '-'}
          </span>
          <span className="meta-item amount">{formatAmount(item.leftAmount)}</span>
        </div>
        <div className="meta-row">
          <span className="meta-item">到期: {item.expireDate}</span>
          <span className="meta-item days-warning">
            <ClockCircleOutlined /> 剩余{item.daysToExpire}天
          </span>
          <span className="meta-item">
            {item.reminderCount > 0 ? `已提醒${item.reminderCount}次` : '未提醒'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default WarningItemCard;
