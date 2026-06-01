/**
 * 客户列表面板
 * 弹窗内：筛选器 + 搜索栏 + 客户表格
 */

import React, { useMemo } from 'react';
import { Tag, Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DrilldownRiskGroup, DrilldownCustomer } from '@/types/sales-analysis';
import { useMobileDetect } from '@/hooks/useMobileDetect';
import { Toolbar, MyViewSummary } from './CustomerListPanelParts';
import styles from './CustomerListPanel.less';

/** 按钻取类型控制表格列显示 */
interface ColumnConfig {
  showGrade: boolean;
  showVisitColumns: boolean;
}

const DRILLDOWN_COLUMN_CONFIG: Record<string, ColumnConfig> = {
  visit_insufficient: { showGrade: true, showVisitColumns: true },
};

const DEFAULT_COLUMN_CONFIG: ColumnConfig = { showGrade: false, showVisitColumns: false };

function getColumnConfig(drilldownKey: string): ColumnConfig {
  return DRILLDOWN_COLUMN_CONFIG[drilldownKey] ?? DEFAULT_COLUMN_CONFIG;
}

/** 通用状态标签：根据 riskGroup.filters 匹配第一个命中的子筛选 */
function renderStatusTag(
  record: DrilldownCustomer,
  filters: DrilldownRiskGroup['filters'],
  tagColor: string,
): React.ReactNode {
  for (const f of filters) {
    if (f.key === 'all') continue;
    if (record.filters.includes(f.key)) {
      return <Tag color={tagColor}>{f.label}</Tag>;
    }
  }
  return '-';
}

/** 拜访预警渲染（仅 visit_insufficient 类型使用） */
function renderVisitWarning(record: DrilldownCustomer): React.ReactNode {
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
}

interface CustomerListPanelProps {
  drilldownKey: string;
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
  drilldownKey, riskGroup, customers, viewMode, filterKey, keyword, ownerFilter, ownerOptions,
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
      <CustomerTable drilldownKey={drilldownKey} riskGroup={riskGroup} customers={customers} />
    )}
  </div>
);

/** 移动端客户卡片 */
const MobileCustomerCard: React.FC<{
  drilldownKey: string;
  riskGroup: DrilldownRiskGroup;
  record: DrilldownCustomer;
}> = ({ drilldownKey, riskGroup, record }) => {
  const config = getColumnConfig(drilldownKey);
  return (
    <div className={styles.mobileCard}>
      <div className={styles.mobileCardHeader}>
        <span className={styles.mobileCardName}>{record.name}</span>
        {config.showGrade && record.grade && <Tag>{record.grade}</Tag>}
      </div>
      <div className={styles.mobileCardSubHeader}>
        {renderStatusTag(record, riskGroup.filters, riskGroup.tagColor)}
        <span className={styles.mobileCardOwner}>负责人：{record.owner || '-'}</span>
      </div>
      <div className={styles.mobileCardGrid}>
        <span>最近下单：{record.order || '-'}</span>
        <span>最近拜访：{record.followUp || '-'}</span>
        {config.showVisitColumns && (
          <>
            <span>目标间隔：{record.visitInterval || '-'}</span>
            <span>拜访预警：{renderVisitWarning(record)}</span>
          </>
        )}
      </div>
    </div>
  );
};

/** 客户表格 / 移动端卡片列表 */
const CustomerTable: React.FC<{
  drilldownKey: string;
  riskGroup: DrilldownRiskGroup;
  customers: DrilldownCustomer[];
}> = ({ drilldownKey, riskGroup, customers }) => {
  const columns = useTableColumns(customers, drilldownKey, riskGroup);
  const isMobile = useMobileDetect();

  if (isMobile) {
    return (
      <div className={styles.mobileCardList}>
        {customers.map(c => (
          <MobileCustomerCard key={c.id} drilldownKey={drilldownKey} riskGroup={riskGroup} record={c} />
        ))}
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

/** 动态生成表格列（按钻取类型条件化） */
function useTableColumns(
  customers: DrilldownCustomer[],
  drilldownKey: string,
  riskGroup: DrilldownRiskGroup,
): ColumnsType<DrilldownCustomer> {
  return useMemo(() => {
    const config = getColumnConfig(drilldownKey);
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
    ];

    if (config.showGrade) {
      fixedColumns.push({ title: '等级', dataIndex: 'grade', width: 60, render: (v: string) => v || '-' });
    }

    fixedColumns.push({
      title: '状态',
      width: 100,
      render: (_: unknown, record: DrilldownCustomer) =>
        renderStatusTag(record, riskGroup.filters, riskGroup.tagColor),
    });

    fixedColumns.push(
      { title: '负责人', dataIndex: 'owner', width: 80, render: (v: string) => v || '-' },
      { title: '最近下单', dataIndex: 'order', width: 90 },
      { title: '最近拜访', dataIndex: 'followUp', width: 90 },
    );

    if (config.showVisitColumns) {
      fixedColumns.push(
        { title: '目标拜访间隔', dataIndex: 'visitInterval', width: 100, render: (v: string) => v || '-' },
        {
          title: '拜访预警',
          width: 120,
          render: (_: unknown, record: DrilldownCustomer) => renderVisitWarning(record),
        },
      );
    }

    const metricColumns: ColumnsType<DrilldownCustomer> = metricLabels.map((label) => ({
      title: label,
      width: 110,
      render: (_: unknown, record: DrilldownCustomer) => {
        const metric = record.detail.metrics.find(m => m.label === label);
        return metric?.value || '-';
      },
    }));

    return [...fixedColumns, ...metricColumns];
  }, [customers, drilldownKey, riskGroup]);
}

export default CustomerListPanel;
