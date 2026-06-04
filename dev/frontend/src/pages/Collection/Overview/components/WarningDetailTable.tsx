/**
 * 预警明细表格列配置与统计摘要组件
 */

import React from 'react';
import {  Tag, Row, Col, Statistic, Card } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import type { UpcomingWarning } from '@/types/ar-collection';

/** 桌面端表格列配置 */
export const warningDetailColumns = [
  {
    title: '单据编号',
    dataIndex: 'billNo',
    key: 'billNo',
    width: 140,
    render: (text: string) => <span style={{ fontFamily: 'monospace' }}>{text}</span>,
  },
  {
    title: '客户名称',
    dataIndex: 'consumerName',
    key: 'consumerName',
    width: 140,
    ellipsis: true,
  },
  {
    title: '负责人',
    dataIndex: 'managerUserName',
    key: 'managerUserName',
    width: 80,
  },
  {
    title: '欠款金额',
    dataIndex: 'leftAmount',
    key: 'leftAmount',
    width: 100,
    align: 'right' as const,
    render: (amount: number) => (
      <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
        ¥{amount?.toLocaleString() ?? 0}
      </span>
    ),
  },
  {
    title: '结算方式',
    dataIndex: 'settleMethod',
    key: 'settleMethod',
    width: 100,
    align: 'center' as const,
    render: (method: number) => (
      <Tag color={method === 2 ? 'blue' : 'green'}>
        {method === 2 ? '挂账' : '现款'}
      </Tag>
    ),
  },
  {
    title: '最大欠款天数',
    dataIndex: 'consumerExpireDay',
    key: 'consumerExpireDay',
    width: 110,
    align: 'center' as const,
    render: (days: number) => (days ? `${days}天` : '-'),
  },
  {
    title: '到期日期',
    dataIndex: 'expireDate',
    key: 'expireDate',
    width: 100,
  },
  {
    title: '剩余天数',
    dataIndex: 'daysToExpire',
    key: 'daysToExpire',
    width: 90,
    align: 'center' as const,
    render: (days: number) => (
      <span style={{ color: '#ff4d4f', fontWeight: 600 }}>
        <ClockCircleOutlined /> {days}天
      </span>
    ),
  },
  {
    title: '提醒情况',
    dataIndex: 'reminderCount',
    key: 'reminderCount',
    width: 90,
    align: 'center' as const,
    render: (count: number) => (
      <Tag color={count > 0 ? 'blue' : 'default'}>
        {count > 0 ? `已提醒${count}次` : '未提醒'}
      </Tag>
    ),
  },
];

interface WarningSummaryProps {
  data: UpcomingWarning[];
  isMobile: boolean;
}

/** 统计摘要卡片 */
export const WarningSummary: React.FC<WarningSummaryProps> = ({ data, isMobile }) => {
  const totalAmount = data.reduce((sum, item) => sum + (item.leftAmount || 0), 0);
  const reminded = data.filter(item => item.reminderCount > 0).length;

  return (
    <Card size="small" style={{ marginBottom: isMobile ? 12 : 16 }}>
      <Row gutter={isMobile ? [8, 8] : 24}>
        <Col>
          <Statistic title="预警数量" value={data.length} suffix="笔" />
        </Col>
        <Col>
          <Statistic
            title="涉及金额"
            value={(totalAmount / 10000).toFixed(1)}
            suffix="万"
            prefix="¥"
            valueStyle={{ color: '#ff4d4f' }}
          />
        </Col>
        <Col>
          <Statistic title="已提醒" value={reminded} suffix="笔" />
        </Col>
        <Col>
          <Statistic title="未提醒" value={data.length - reminded} suffix="笔" />
        </Col>
      </Row>
    </Card>
  );
};
