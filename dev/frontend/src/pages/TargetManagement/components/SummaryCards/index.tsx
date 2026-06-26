/**
 * 汇总卡片区
 * 展示目标销售额、人均销售额、客均销售额、覆盖客户数、覆盖商品数
 */
import React from 'react';
import {
  DollarOutlined, UserOutlined, TeamOutlined, ShopOutlined,
} from '@ant-design/icons';
import type { TargetSummary } from '@/types/target-management';
import styles from './index.less';

interface SummaryCardsProps {
  summary: TargetSummary;
}

/** 格式化金额（万元） */
function formatAmount(amount: number): string {
  if (amount >= 10000) return `¥${(amount / 10000).toFixed(1)}万`;
  return `¥${amount.toLocaleString()}`;
}

interface CardDef {
  key: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  render: (data: TargetSummary) => React.ReactNode;
}

const CARDS: CardDef[] = [
  {
    key: 'amount', title: '目标销售额', icon: <DollarOutlined />, color: '#faad14',
    render: (d) => formatAmount(d.totalTargetAmount),
  },
  {
    key: 'perMarketer', title: '人均销售额', icon: <UserOutlined />, color: '#1890ff',
    render: (d) => `${formatAmount(d.amountPerMarketer)}/人`,
  },
  {
    key: 'perCustomer', title: '客均销售额', icon: <TeamOutlined />, color: '#13c2c2',
    render: (d) => `${formatAmount(d.amountPerCustomer)}/客`,
  },
  {
    key: 'customers', title: '覆盖客户数', icon: <TeamOutlined />, color: '#52c41a',
    render: (d) => `${d.coveredCustomers} / ${d.totalCustomers}`,
  },
  {
    key: 'products', title: '覆盖商品数', icon: <ShopOutlined />, color: '#722ed1',
    render: (d) => `${d.coveredProducts} / ${d.totalProducts}`,
  },
];

const SummaryCards: React.FC<SummaryCardsProps> = ({ summary }) => {
  return (
    <div className={styles.cardGrid}>
      {CARDS.map((card) => (
        <div key={card.key} className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon} style={{ color: card.color }}>{card.icon}</span>
            <span className={styles.cardTitle}>{card.title}</span>
          </div>
          <div className={styles.cardValue}>{card.render(summary)}</div>
        </div>
      ))}
    </div>
  );
};

export default SummaryCards;
