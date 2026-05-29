/**
 * 客户列表面板
 * 弹窗内：筛选器 + 搜索栏 + 客户表格
 */

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Tag, Empty, Table, Input, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DrilldownRiskGroup, DrilldownCustomer, DrilldownMyView } from '@/types/sales-analysis';
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
    <FilterBar filters={riskGroup.filters} filterKey={filterKey} note={riskGroup.filterNote} onChange={onFilterChange} />
    <SearchBar
      keyword={keyword}
      ownerFilter={ownerFilter}
      ownerOptions={ownerOptions}
      onKeywordChange={onKeywordChange}
      onOwnerFilterChange={onOwnerFilterChange}
    />
    {viewMode === 'mine' && <MyViewSummary myView={riskGroup.myView} />}
    {customers.length === 0 ? (
      <Empty description={viewMode === 'mine' ? '当前分类下暂无我的客户' : '当前筛选条件下暂无客户'} className={styles.empty} />
    ) : (
      <CustomerTable customers={customers} />
    )}
  </div>
);

/** 筛选栏 */
const FilterBar: React.FC<{
  filters: DrilldownRiskGroup['filters'];
  filterKey: string;
  note: string;
  onChange: (key: string) => void;
}> = ({ filters, filterKey, note, onChange }) => (
  <div className={styles.toolbar}>
    <div className={styles.filterGroup}>
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          className={`${styles.filterChip} ${f.key === filterKey ? styles.active : ''}`}
          onClick={() => onChange(f.key)}
        >
          {f.label}
        </button>
      ))}
    </div>
    <span className={styles.toolbarNote}>{note}</span>
  </div>
);

/** 搜索栏：关键词搜索 + 负责人筛选 */
const SearchBar: React.FC<{
  keyword: string;
  ownerFilter: string;
  ownerOptions: string[];
  onKeywordChange: (keyword: string) => void;
  onOwnerFilterChange: (owner: string) => void;
}> = ({ keyword, ownerFilter, ownerOptions, onKeywordChange, onOwnerFilterChange }) => {
  const [inputValue, setInputValue] = useState(keyword);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(() => onKeywordChange(inputValue), 300);
    return () => clearTimeout(timerRef.current);
  }, [inputValue, onKeywordChange]);

  return (
    <div className={styles.searchBar}>
      <Input.Search
        placeholder="搜索客户名称"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        allowClear
        style={{ flex: 1 }}
      />
      <Select
        placeholder="负责人"
        value={ownerFilter || undefined}
        onChange={(val) => onOwnerFilterChange(val || '')}
        allowClear
        style={{ width: 140 }}
        options={ownerOptions.map((o) => ({ value: o, label: o }))}
      />
    </div>
  );
};

/** 客户表格 */
const CustomerTable: React.FC<{ customers: DrilldownCustomer[] }> = ({ customers }) => {
  const columns = useTableColumns(customers);
  return (
    <div className={styles.tableWrapper}>
      <Table
        dataSource={customers}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 720 }}
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
        render: (name: string, record) => (
          <div>
            <div style={{ fontWeight: 500 }}>{name}</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
              {record.tags.map((tag) => (
                <Tag key={tag.text} color={tag.color} style={{ marginRight: 0 }}>{tag.text}</Tag>
              ))}
            </div>
          </div>
        ),
      },
      { title: '负责人', dataIndex: 'owner', width: 80, render: (v: string) => v || '-' },
      { title: '最近下单', dataIndex: 'order', width: 120 },
      { title: '最近跟进', dataIndex: 'followUp', width: 120 },
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
