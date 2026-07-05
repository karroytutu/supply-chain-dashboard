/**
 * 概览视图面板
 * 展示全局指标卡片（当月目标总额、目标客户数、目标SKU数、目标客单价）+ 营销师明细表
 */
import React, { useMemo } from 'react';
import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { OverviewResponse, MarketerOverview } from '@/services/api/sales-target';
import { formatCompactAmount, formatGrowthRate } from '@/utils/format';
import styles from './index.less';

interface OverviewPanelProps {
  data: OverviewResponse;
  onClickMarketer: (marketerId: number) => void;
}

/** 格式化增长率 */
function renderGrowthRate(rate: number | null): React.ReactNode {
  const g = formatGrowthRate(rate);
  const className = g.sign === 'positive' ? styles.positive : g.sign === 'negative' ? styles.negative : '';
  return <span className={className}>{g.text}</span>;
}

/** 格式化环比变化 */
function formatMom(current: number, previous: number): { text: string; className: string } {
  // 无数据场景：当前无目标或双零时显示灰色"-"，避免误导性的红色负增长率
  if (current === 0) return { text: '-', className: '' };
  if (previous === 0) return { text: '+∞', className: styles.positive };
  const rate = (current - previous) / previous;
  const pct = (rate * 100).toFixed(1);
  if (rate > 0) return { text: `+${pct}%`, className: styles.positive };
  if (rate < 0) return { text: `${pct}%`, className: styles.negative };
  return { text: '0.0%', className: '' };
}

/** 指标卡片定义 */
interface MetricCard {
  label: string;
  value: string;
  mom: { text: string; className: string };
  lastMonthLabel: string;
  lastMonthValue: string;
}

const OverviewPanel: React.FC<OverviewPanelProps> = ({ data, onClickMarketer }) => {
  const { summary, marketers } = data;

  const cards: MetricCard[] = [
    {
      label: '当月目标总额',
      value: summary.marketersWithTarget > 0 ? formatCompactAmount(summary.totalTarget) : '-',
      mom: summary.marketersWithTarget > 0
        ? formatMom(summary.totalTarget, summary.totalLastMonthActual)
        : { text: '-', className: '' },
      lastMonthLabel: '上月实际',
      lastMonthValue: formatCompactAmount(summary.totalLastMonthActual),
    },
    {
      label: '目标客户数',
      value: String(summary.targetCustomerCount),
      mom: formatMom(summary.targetCustomerCount, summary.lastMonthCustomerCount),
      lastMonthLabel: '上月实际',
      lastMonthValue: String(summary.lastMonthCustomerCount),
    },
    {
      label: '目标SKU数',
      value: `${summary.targetSkuCount}`,
      mom: formatMom(summary.targetSkuCount, summary.lastMonthSkuCount),
      lastMonthLabel: '上月实际',
      lastMonthValue: String(summary.lastMonthSkuCount),
    },
    {
      label: '目标客单价',
      value: summary.targetCustomerCount > 0 ? formatCompactAmount(summary.avgCustomerValue) : '-',
      mom: formatMom(summary.avgCustomerValue, summary.lastMonthAvgCustomerValue),
      lastMonthLabel: '上月实际',
      lastMonthValue: summary.lastMonthAvgCustomerValue > 0 ? formatCompactAmount(summary.lastMonthAvgCustomerValue) : '-',
    },
  ];

  const columns: ColumnsType<MarketerOverview> = useMemo(() => [
    {
      title: '营销师',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (name: string) => <span className={styles.marketerName}>{name}</span>,
    },
    {
      title: '当月目标',
      key: 'targetAmount',
      width: 120,
      align: 'right',
      render: (_: unknown, r: MarketerOverview) => r.hasSaved ? formatCompactAmount(r.targetAmount) : '-',
    },
    {
      title: '上月达成',
      dataIndex: 'lastMonthActual',
      key: 'lastMonthActual',
      width: 120,
      align: 'right',
      render: (v: number) => formatCompactAmount(v),
    },
    {
      title: '增长率',
      dataIndex: 'growthRate',
      key: 'growthRate',
      width: 90,
      align: 'right',
      render: (rate: number | null) => renderGrowthRate(rate),
    },
    {
      title: '客户数',
      dataIndex: 'customerCount',
      key: 'customerCount',
      width: 80,
      align: 'right',
    },
    {
      title: 'SKU数',
      dataIndex: 'skuCount',
      key: 'skuCount',
      width: 80,
      align: 'right',
    },
    {
      title: '预计毛利',
      key: 'estimatedGrossProfit',
      width: 120,
      align: 'right',
      render: (_: unknown, r: MarketerOverview) => r.hasSaved ? formatCompactAmount(r.estimatedGrossProfit) : '-',
    },
    {
      title: '基准提成',
      key: 'baseCommission',
      width: 90,
      align: 'right',
      render: (_: unknown, r: MarketerOverview) => r.hasSaved ? formatCompactAmount(r.baseCommission) : '-',
    },
    {
      title: '增量提成',
      key: 'incrementCommission',
      width: 90,
      align: 'right',
      render: (_: unknown, r: MarketerOverview) => r.hasSaved ? formatCompactAmount(r.incrementCommission) : '-',
    },
    {
      title: '状态',
      key: 'status',
      width: 90,
      align: 'center',
      render: (_: unknown, r: MarketerOverview) => {
        if (!r.hasSaved && !r.targetStatus) return <Tag>未制定</Tag>;
        if (r.targetStatus === 'draft') return <Tag color="warning">草稿</Tag>;
        if (r.targetStatus === 'pending') return <Tag color="processing">审批中</Tag>;
        if (r.targetStatus === 'approved') return <Tag color="success">已审批</Tag>;
        if (r.targetStatus === 'rejected') return <Tag color="error">已驳回</Tag>;
        return '-';
      },
    },
  ], []);

  return (
    <div className={styles.panel}>
      {/* 指标卡片 */}
      <div className={styles.summaryRow}>
        {cards.map((card) => (
          <div key={card.label} className={styles.summaryCard}>
            <span className={styles.summaryLabel}>{card.label}</span>
            <span className={styles.summaryValue}>{card.value}</span>
            <div className={styles.momRow}>
              <span className={styles.momLabel}>{card.lastMonthLabel} {card.lastMonthValue}</span>
              <span className={`${styles.momValue} ${card.mom.className}`}>{card.mom.text}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 营销师明细表 */}
      <div className={styles.table}>
        <Table<MarketerOverview>
          columns={columns}
          dataSource={marketers}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ y: 'calc(100vh - 400px)' }}
          onRow={(record) => ({ onClick: () => onClickMarketer(record.id), style: { cursor: 'pointer' } })}
        />
      </div>
    </div>
  );
};

export default React.memo(OverviewPanel);
