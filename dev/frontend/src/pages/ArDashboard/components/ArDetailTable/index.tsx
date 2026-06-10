/**
 * 应收账款明细表
 * 带筛选的明细表，业务人员可快速查看每笔应收账款情况
 * 支持催收进度管道节点的联动筛选
 * 移动端精简列：保留核心6列，筛选栏网格布局
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Card, Table, Select, Input, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import useMobileDetect from '@/hooks/useMobileDetect';
import { STATUS_LABEL_MAP } from '@/constants/arDashboard';
import styles from './index.less';

interface ArDetailTableProps {
  data: ArDetailRow[];
  marketerOptions: { value: string; label: string }[];
  /** 催收进度管道联动复合筛选 */
  pipelineFilter: PipelineFilter;
}

/** 逾期天数颜色 */
const overdueColor = (days: number) => {
  if (days <= 0) return 'rgba(0,0,0,0.25)';
  if (days <= 30) return '#52c41a';
  if (days <= 60) return '#fa8c16';
  return '#f5222d';
};

/** 逾期天数显示文本 */
const overdueText = (days: number) => {
  if (days <= 0) return '未逾期';
  return `${days}天`;
};

const OVERDUE_RANGE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'none', label: '未逾期' },
  { value: '1-30', label: '1-30天' },
  { value: '31-60', label: '31-60天' },
  { value: '60+', label: '60天以上' },
];

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  ...Object.entries(STATUS_LABEL_MAP).map(([k, v]) => ({ value: k, label: v.label })),
];

/** 标记为仅桌面端显示的列 */
const desktopOnly = <T extends Record<string, unknown>>(col: T): T & { responsive: ('xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl')[] } => ({
  ...col,
  responsive: ['md'] as ('xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl')[],
});

const ALL_COLUMNS: ColumnsType<ArDetailRow> = [
  {
    title: '单据编号',
    dataIndex: 'billNo',
    width: 140,
    fixed: 'left',
  },
  {
    title: '客户名称',
    dataIndex: 'consumerName',
    width: 140,
  },
  desktopOnly({
    title: '单据类型',
    dataIndex: 'billTypeName',
    width: 100,
  }),
  desktopOnly({
    title: '单据日期',
    dataIndex: 'billOrderTime',
    width: 110,
  }),
  desktopOnly({
    title: '单据金额',
    dataIndex: 'totalAmount',
    width: 110,
    align: 'right' as const,
    sorter: (a: ArDetailRow, b: ArDetailRow) => a.totalAmount - b.totalAmount,
    render: (v: number) => `¥${v.toLocaleString()}`,
  }),
  {
    title: '未收金额',
    dataIndex: 'leftAmount',
    width: 110,
    align: 'right',
    sorter: (a, b) => a.leftAmount - b.leftAmount,
    render: (v: number) => (
      <span style={{ fontWeight: v > 0 ? 500 : 400 }}>¥{v.toLocaleString()}</span>
    ),
  },
  desktopOnly({
    title: '到期日',
    dataIndex: 'expireTime',
    width: 110,
  }),
  {
    title: '逾期天数',
    dataIndex: 'overdueDays',
    width: 90,
    align: 'center',
    sorter: (a, b) => a.overdueDays - b.overdueDays,
    render: (v: number) => (
      <span style={{ color: overdueColor(v), fontWeight: v > 0 ? 600 : 400 }}>
        {overdueText(v)}
      </span>
    ),
  },
  {
    title: '账龄',
    dataIndex: 'agingBucket',
    width: 90,
    align: 'center',
    render: (v: string) => {
      const colorMap: Record<string, string> = {
        '未逾期': 'default',
        '1-30天': 'green',
        '31-60天': 'orange',
        '61-90天': 'red',
        '90天以上': '#cf1322',
      };
      return <Tag color={colorMap[v] || 'default'}>{v}</Tag>;
    },
  },
  desktopOnly({
    title: '授信额度',
    dataIndex: 'creditLimit',
    width: 110,
    align: 'right' as const,
    render: (v: number | null) => v == null ? '--' : (
      <span style={{ color: 'rgba(0,0,0,0.65)' }}>¥{v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v.toLocaleString()}</span>
    ),
  }),
  {
    title: '催收状态',
    dataIndex: 'status',
    width: 100,
    render: (status: CollectionTaskStatus | null) => {
      if (!status) return <Tag>未入催</Tag>;
      const cfg = STATUS_LABEL_MAP[status];
      return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : status;
    },
  },
  desktopOnly({
    title: '营销师',
    dataIndex: 'managerUserName',
    width: 90,
  }),
];

const ArDetailTable: React.FC<ArDetailTableProps> = ({
  data,
  marketerOptions,
  pipelineFilter,
}) => {
  const isMobile = useMobileDetect();

  const [filters, setFilters] = useState<ArDetailFilters>({
    overdueRange: 'all',
    keyword: '',
  });

  // 联动：当管道节点被点击时，同步更新状态筛选（含升级层级）
  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      status: pipelineFilter.status || '',
      escalationLevel: pipelineFilter.escalationLevel,
    }));
  }, [pipelineFilter]);

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      if (filters.status && row.status !== filters.status) return false;
      if (filters.escalationLevel && row.escalationLevel !== filters.escalationLevel) return false;
      if (filters.overdueRange !== 'all') {
        if (filters.overdueRange === 'none' && row.overdueDays > 0) return false;
        if (filters.overdueRange === '1-30' && (row.overdueDays < 1 || row.overdueDays > 30))
          return false;
        if (filters.overdueRange === '31-60' && (row.overdueDays < 31 || row.overdueDays > 60))
          return false;
        if (filters.overdueRange === '60+' && row.overdueDays <= 60) return false;
      }
      if (filters.managerName) {
        if (row.managerUserName !== filters.managerName) return false;
      }
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        if (
          !row.billNo.toLowerCase().includes(kw) &&
          !row.consumerName.toLowerCase().includes(kw)
        )
          return false;
      }
      return true;
    });
  }, [data, filters, marketerOptions]);

  /** 移动端过滤掉桌面专属列 */
  const columns = useMemo(() => {
    if (isMobile) {
      return ALL_COLUMNS.filter((col) => !('responsive' in col));
    }
    return ALL_COLUMNS;
  }, [isMobile]);

  return (
    <Card title="应收账款明细" bordered={false} className={styles.card}>
      {/* 筛选栏 */}
      <div className={styles.filters}>
        <div className={styles.filterGrid}>
          <Select
            value={filters.status || ''}
            options={STATUS_OPTIONS}
            onChange={(v) => setFilters((p) => ({ ...p, status: v as CollectionTaskStatus | '' }))}
            style={{ width: '100%' }}
            placeholder="催收状态"
          />
          <Select
            value={filters.overdueRange}
            options={OVERDUE_RANGE_OPTIONS}
            onChange={(v) => setFilters((p) => ({ ...p, overdueRange: v }))}
            style={{ width: '100%' }}
          />
          <Select
            value={filters.managerName || ''}
            options={[{ value: '', label: '全部营销师' }, ...marketerOptions]}
            onChange={(v) => setFilters((p) => ({ ...p, managerName: v as string }))}
            style={{ width: '100%' }}
            placeholder="营销师"
          />
          <Input
            value={filters.keyword}
            onChange={(e) => setFilters((p) => ({ ...p, keyword: e.target.value }))}
            prefix={<SearchOutlined />}
            placeholder="搜索客户名/单据编号"
            style={{ width: '100%' }}
            allowClear
          />
        </div>
        <span className={styles.count}>
          共 <strong>{filteredData.length}</strong> 条
        </span>
      </div>

      <Table<ArDetailRow>
        rowKey="billNo"
        columns={columns}
        dataSource={filteredData}
        pagination={{ pageSize: isMobile ? 5 : 10, showSizeChanger: !isMobile, showTotal: (t) => `共 ${t} 条` }}
        size="small"
        scroll={{ x: 'max-content' }}
      />
    </Card>
  );
};

export default ArDetailTable;
