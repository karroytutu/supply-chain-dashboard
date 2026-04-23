/**
 * 客户列表面板
 * 弹窗左侧：筛选器 + 我的视图 + 客户列表
 */

import React from 'react';
import { Tag, Empty } from 'antd';
import type { DrilldownRiskGroup, DrilldownCustomer, DrilldownMyView } from '@/types/sales-analysis';
import styles from './CustomerListPanel.less';

const CURRENT_USER = '张晨';

interface CustomerListPanelProps {
  riskGroup: DrilldownRiskGroup;
  customers: DrilldownCustomer[];
  viewMode: 'all' | 'mine';
  filterKey: string;
  selectedCustomerId: string | null;
  onFilterChange: (key: string) => void;
  onSelectCustomer: (id: string) => void;
}

const CustomerListPanel: React.FC<CustomerListPanelProps> = ({
  riskGroup, customers, viewMode, filterKey, selectedCustomerId, onFilterChange, onSelectCustomer,
}) => (
  <div className={styles.wrap}>
    <FilterBar filters={riskGroup.filters} filterKey={filterKey} note={riskGroup.filterNote} onChange={onFilterChange} />
    {viewMode === 'mine' && <MyViewSummary myView={riskGroup.myView} />}
    {customers.length === 0 ? (
      <Empty description={viewMode === 'mine' ? '当前分类下暂无我的客户' : '当前筛选条件下暂无客户'} className={styles.empty} />
    ) : (
      <div className={styles.customerList}>
        {customers.map((customer) => (
          <CustomerItem
            key={customer.id}
            customer={customer}
            active={customer.id === selectedCustomerId}
            isMine={customer.owner === CURRENT_USER}
            onClick={() => onSelectCustomer(customer.id)}
          />
        ))}
      </div>
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

/** 客户列表项 */
const CustomerItem: React.FC<{
  customer: DrilldownCustomer;
  active: boolean;
  isMine: boolean;
  onClick: () => void;
}> = ({ customer, active, isMine, onClick }) => (
  <div
    className={`${styles.customerItem} ${active ? styles.active : ''} ${isMine ? styles.mine : ''}`}
    onClick={onClick}
    role="button"
    tabIndex={0}
  >
    <div className={styles.customerItemTop}>
      <span className={styles.customerName}>{customer.name}</span>
      <div className={styles.customerTags}>
        {isMine && <Tag color="purple">我的客户</Tag>}
        {customer.tags.map((tag) => (
          <Tag key={tag.text} color={tag.color}>{tag.text}</Tag>
        ))}
      </div>
    </div>
    <p className={styles.customerDesc}>{customer.summary}</p>
    <div className={styles.customerMeta}>
      负责人：{customer.owner} | {customer.order} | {customer.followUp}
    </div>
  </div>
);

export default CustomerListPanel;
