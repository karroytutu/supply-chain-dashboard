/**
 * 营销师维度面板
 * 展示各营销师负责的应收账款情况，含 DSO 指标
 * 移动端精简列：隐藏欠款客户数和催收中
 */

import React, { useMemo } from 'react';
import { Card, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import useMobileDetect from '@/hooks/useMobileDetect';
import styles from './index.less';

interface MarketerPanelProps {
  data: MarketerStats[];
}

/** DSO 健康度颜色 */
const dsoColor = (dso: number) => {
  if (dso <= 30) return '#52c41a';
  if (dso <= 45) return '#fa8c16';
  return '#f5222d';
};

const ALL_COLUMNS: ColumnsType<MarketerStats> = [
  {
    title: '营销师',
    dataIndex: 'marketerName',
    width: 90,
    fixed: 'left',
    render: (name: string) => <span className={styles.name}>{name}</span>,
  },
  {
    title: '欠款客户数',
    dataIndex: 'debtCustomerCount',
    width: 100,
    align: 'center',
    render: (v: number) => <span>{v} 家</span>,
    responsive: ['md'],
  },
  {
    title: '欠款总额',
    dataIndex: 'debtAmount',
    width: 110,
    align: 'right',
    sorter: (a, b) => a.debtAmount - b.debtAmount,
    render: (v: number) => (
      <span>¥{v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()}</span>
    ),
  },
  {
    title: '逾期客户数',
    dataIndex: 'overdueCustomerCount',
    width: 100,
    align: 'center',
    render: (v: number) => (
      <span style={{ color: v > 10 ? '#f5222d' : v > 5 ? '#fa8c16' : undefined }}>
        {v} 家
      </span>
    ),
  },
  {
    title: '逾期总额',
    dataIndex: 'overdueAmount',
    width: 110,
    align: 'right',
    sorter: (a, b) => a.overdueAmount - b.overdueAmount,
    render: (v: number) => (
      <span style={{ color: v > 100000 ? '#f5222d' : v > 50000 ? '#fa8c16' : undefined }}>
        ¥{v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()}
      </span>
    ),
  },
  {
    title: 'DSO（天）',
    dataIndex: 'dso',
    width: 90,
    align: 'center',
    sorter: (a, b) => (a.dso ?? 0) - (b.dso ?? 0),
    render: (v: number | null) => v == null ? '--' : (
      <Tag color={dsoColor(v)} className={styles.dsoTag}>
        {v}天
      </Tag>
    ),
  },
  {
    title: '催收中',
    dataIndex: 'collectingCount',
    width: 80,
    align: 'center',
    render: (v: number) => (
      <span style={{ color: v > 0 ? '#1890ff' : 'rgba(0,0,0,0.25)' }}>{v}</span>
    ),
    responsive: ['md'],
  },
];

const MarketerPanel: React.FC<MarketerPanelProps> = ({ data }) => {
  const isMobile = useMobileDetect();

  /** 移动端过滤掉带 responsive 标记的列 */
  const columns = useMemo(() => {
    if (isMobile) {
      return ALL_COLUMNS.filter((col) => !('responsive' in col));
    }
    return ALL_COLUMNS;
  }, [isMobile]);

  return (
    <Card
      title="营销师维度"
      bordered={false}
      className={styles.card}
    >
      <Table<MarketerStats>
        rowKey="marketerName"
        columns={columns}
        dataSource={data}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
      />
    </Card>
  );
};

export default MarketerPanel;
