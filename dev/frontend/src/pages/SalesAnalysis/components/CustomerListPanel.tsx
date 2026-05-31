/**
 * 客户列表面板
 * 弹窗内：筛选器 + 搜索栏 + 客户表格
 */

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Tag, Empty, Table, Input, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DrilldownRiskGroup, DrilldownCustomer, DrilldownMyView } from '@/types/sales-analysis';
import { useMobileDetect } from '@/hooks/useMobileDetect';
import styles from './CustomerListPanel.less';

interface CustomerListPanelProps {
  riskGroup: DrilldownRiskGroup;
  customers: DrilldownCustomer[];
  viewMode: 'all' | 'mine';
  filterKey: string;
  keyword: string;
  ownerFilter: string;
  ownerOptions: string[];
  onFilterChange: (key: string) => void;
  onKeywordChange: (keyword: string) => void;
  onOwnerFilterChange: (owner: string) => void;
}

const CustomerListPanel: React.FC<CustomerListPanelProps> = ({
  riskGroup, customers, viewMode, filterKey, keyword, ownerFilter, ownerOptions,
  onFilterChange, onKeywordChange, onOwnerFilterChange,
}) => (
  <div className={styles.wrap}>
    <Toolbar
      filters={riskGroup.filters}
      filterKey={filterKey}
      keyword={keyword}
      ownerFilter={ownerFilter}
      ownerOptions={ownerOptions}
      onFilterChange={onFilterChange}
      onKeywordChange={onKeywordChange}
      onOwnerFilterChange={onOwnerFilterChange}
    />
    {viewMode === 'mine' && riskGroup.myView && <MyViewSummary myView={riskGroup.myView} />}
    {customers.length === 0 ? (
      <Empty description={viewMode === 'mine' ? '当前分类下暂无我的客户' : '当前筛选条件下暂无客户'} className={styles.empty} />
    ) : (
      <CustomerTable customers={customers} />
    )}
  </div>
);

/** 工具栏：筛选标签 + 搜索 + 负责人，合并为一行 */
const Toolbar: React.FC<{
  filters: DrilldownRiskGroup['filters'];
  filterKey: string;
  note: string;
  keyword: string;
  ownerFilter: string;
  ownerOptions: string[];
  onFilterChange: (key: string) => void;
  onKeywordChange: (keyword: string) => void;
  onOwnerFilterChange: (owner: string) => void;
}> = ({ filters, filterKey, keyword, ownerFilter, ownerOptions, onFilterChange, onKeywordChange, onOwnerFilterChange }) => {
  const [inputValue, setInputValue] = useState(keyword);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const isMobile = useMobileDetect();
  const compactSize = isMobile ? 'small' as const : undefined;

  useEffect(() => {
    timerRef.current = setTimeout(() => onKeywordChange(inputValue), 300);
    return () => clearTimeout(timerRef.current);
  }, [inputValue, onKeywordChange]);

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarRow}>
        {filters.length > 1 && (
          <div className={styles.filterSelect}>
            <Select
              placeholder="状态"
              value={filterKey}
              onChange={(val) => onFilterChange(val)}
              size={compactSize}
              style={{ width: '100%' }}
              options={filters.map((f) => ({ value: f.key, label: f.label }))}
            />
          </div>
        )}
        <div className={styles.filterSearch}>
          <Input.Search
            placeholder="搜索客户名称"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            allowClear
            size={compactSize}
            style={{ width: '100%' }}
          />
        </div>
        <div className={styles.ownerSelect}>
          <Select
            placeholder="负责人"
            value={ownerFilter || undefined}
            onChange={(val) => onOwnerFilterChange(val || '')}
            allowClear
            size={compactSize}
            style={{ width: '100%' }}
            options={ownerOptions.map((o) => ({ value: o, label: o }))}
          />
        </div>
      </div>

    </div>
  );
};

/** 拜访预警渲染（卡片和表格共用） */
function renderVisitWarning(record: DrilldownCustomer) {
  if (!record.followUp || !record.visitInterval) return <span>-</span>;
  const days = parseInt(record.followUp);
  const limit = parseInt(record.visitInterval);
  if (isNaN(days) || isNaN(limit)) return <span>-</span>;
  if (days > limit) {
    return <Tag color="red">已超期 {days - limit} 天</Tag>;
  }
  const remaining = limit - days;
  if (remaining <= 3) {
    return <Tag color="orange">{remaining} 天后超期</Tag>;
  }
  return <span style={{ color: '#52c41a' }}>正常</span>;
}

/** 移动端客户卡片 */
const MobileCustomerCard: React.FC<{ record: DrilldownCustomer }> = ({ record }) => (
  <div className={styles.mobileCard}>
    <div className={styles.mobileCardHeader}>
      <span className={styles.mobileCardName}>{record.name}</span>
      {record.grade && <Tag>{record.grade}</Tag>}
    </div>
    <div className={styles.mobileCardSubHeader}>
      {record.filters.includes('approaching')
        ? <Tag color="orange">即将超期</Tag>
        : <Tag color="red">已超期</Tag>}
      <span className={styles.mobileCardOwner}>负责人：{record.owner || '-'}</span>
    </div>
    <div className={styles.mobileCardGrid}>
      <span>最近下单：{record.order || '-'}</span>
      <span>最近拜访：{record.followUp || '-'}</span>
      <span>目标间隔：{record.visitInterval || '-'}</span>
      <span>拜访预警：{renderVisitWarning(record)}</span>
    </div>
  </div>
);

/** 客户表格 / 移动端卡片列表 */
const CustomerTable: React.FC<{ customers: DrilldownCustomer[] }> = ({ customers }) => {
  const columns = useTableColumns(customers);
  const isMobile = useMobileDetect();

  if (isMobile) {
    return (
      <div className={styles.mobileCardList}>
        {customers.map(c => <MobileCustomerCard key={c.id} record={c} />)}
      </div>
    );
  }

  return (
    <div className={styles.tableWrapper}>
      <Table
        dataSource={customers}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 790 }}
      />
    </div>
  );
};

/** 动态生成表格列 */
function useTableColumns(customers: DrilldownCustomer[]): ColumnsType<DrilldownCustomer> {
  return useMemo(() => {
    const labelSet = new Set<string>();
    customers.forEach(c => c.detail.metrics.forEach(m => labelSet.add(m.label)));
    const metricLabels = Array.from(labelSet);

    const fixedColumns: ColumnsType<DrilldownCustomer> = [
      {
        title: '客户名称',
        dataIndex: 'name',
        width: 160,
        render: (name: string) => <div style={{ fontWeight: 500 }}>{name}</div>,
      },
      { title: '等级', dataIndex: 'grade', width: 60, render: (v: string) => v || '-' },
      {
        title: '状态',
        width: 90,
        render: (_: unknown, record: DrilldownCustomer) => {
          if (record.filters.includes('approaching')) {
            return <Tag color="orange">即将超期</Tag>;
          }
          return <Tag color="red">已超期</Tag>;
        },
      },
      { title: '负责人', dataIndex: 'owner', width: 80, render: (v: string) => v || '-' },
      { title: '最近下单', dataIndex: 'order', width: 90 },
      { title: '最近拜访', dataIndex: 'followUp', width: 90 },
      { title: '目标拜访间隔', dataIndex: 'visitInterval', width: 100, render: (v: string) => v || '-' },
      {
        title: '拜访预警',
        width: 120,
        render: (_: unknown, record: DrilldownCustomer) => {
          if (!record.followUp || !record.visitInterval) return '-';
          const days = parseInt(record.followUp);
          const limit = parseInt(record.visitInterval);
          if (isNaN(days) || isNaN(limit)) return '-';
          if (days > limit) {
            return <Tag color="red">已超期 {days - limit} 天</Tag>;
          }
          const remaining = limit - days;
          if (remaining <= 3) {
            return <Tag color="orange">{remaining} 天后超期</Tag>;
          }
          return <span style={{ color: '#52c41a' }}>正常</span>;
        },
      },
    ];

    const metricColumns: ColumnsType<DrilldownCustomer> = metricLabels.map((label) => ({
      title: label,
      width: 110,
      render: (_: unknown, record: DrilldownCustomer) => {
        const metric = record.detail.metrics.find(m => m.label === label);
        return metric?.value || '-';
      },
    }));

    return [...fixedColumns, ...metricColumns];
  }, [customers]);
}

/** 我的视图概要 */
const MyViewSummary: React.FC<{ myView: DrilldownMyView }> = ({ myView }) => (
  <div className={styles.myViewSummary}>
    <div>
      <div className={styles.myViewKicker}>业务员视角</div>
      <h4 className={styles.myViewTitle}>{myView.title}</h4>
      <p className={styles.myViewNote}>{myView.note}</p>
    </div>
    <div className={styles.myViewFocus}>
      <div className={styles.myViewFocusTop}>
        <span className={styles.myViewFocusLabel}>{myView.focusLabel}</span>
        <span className={styles.myViewFocusStatus}>{myView.focusStatus}</span>
      </div>
      <div className={styles.myViewFocusName}>{myView.focusName}</div>
      <p className={styles.myViewFocusNote}>{myView.focusNote}</p>
    </div>
  </div>
);

export default CustomerListPanel;
