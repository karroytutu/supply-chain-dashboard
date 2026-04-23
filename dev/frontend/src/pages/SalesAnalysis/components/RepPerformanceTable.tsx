/**
 * 业务员综合表现表格
 */

import React from 'react';
import { Card, Table, Tag } from 'antd';
import type { SalesRepRow } from '@/types/sales-analysis';
import styles from './RepPerformanceTable.less';

interface RepPerformanceTableProps {
  data: SalesRepRow[];
}

const RepPerformanceTable: React.FC<RepPerformanceTableProps> = ({ data }) => {
  const columns = [
    { title: '业务员', dataIndex: 'name', key: 'name', render: (v: string) => <strong>{v}</strong> },
    { title: '销售额', dataIndex: 'sales', key: 'sales', render: (v: number) => `¥${v.toLocaleString()}` },
    { title: '订单量', dataIndex: 'orders', key: 'orders' },
    { title: '回款额', dataIndex: 'collection', key: 'collection', render: (v: number) => `¥${v.toLocaleString()}` },
    { title: '毛利', dataIndex: 'profit', key: 'profit', render: (v: number) => `¥${v.toLocaleString()}` },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: { text: string; color: string }) => (
        <Tag color={status.color}>{status.text}</Tag>
      ),
    },
  ];

  return (
    <Card className={styles.card} size="small" title={null}>
      <div className={styles.cardTitleRow}>
        <div>
          <h3 className={styles.cardTitle}>业务员综合表现</h3>
          <p className={styles.cardSubtitle}>按销售额、订单量、回款额、毛利等指标查看个人表现。</p>
        </div>
      </div>
      <Table
        dataSource={data}
        columns={columns}
        rowKey="name"
        pagination={false}
        size="small"
      />
    </Card>
  );
};

export default RepPerformanceTable;
