/**
 * 风险客户钻取弹窗
 * 表格视图：筛选 + 搜索 + 客户表格
 */

import React from 'react';
import { Modal, Button } from 'antd';
import CustomerListPanel from './CustomerListPanel';
import type { DrilldownRiskGroup, DrilldownCustomer } from '@/types/sales-analysis';
import styles from './CustomerDrilldownModal.less';

interface CustomerDrilldownModalProps {
  drilldown: {
    state: {
      open: boolean;
      drilldownKey: string;
      viewMode: 'all' | 'mine';
      filterKey: string;
      keyword: string;
      ownerFilter: string;
    };
    actions: {
      closeModal: () => void;
      setViewMode: (mode: 'all' | 'mine') => void;
      setFilterKey: (key: string) => void;
      setKeyword: (keyword: string) => void;
      setOwnerFilter: (owner: string) => void;
    };
    riskGroup: DrilldownRiskGroup | undefined;
    filteredCustomers: DrilldownCustomer[];
    ownerOptions: string[];
  };
}

const CustomerDrilldownModal: React.FC<CustomerDrilldownModalProps> = ({ drilldown }) => {
  if (!drilldown.riskGroup) return null;

  return (
    <Modal
      open={drilldown.state.open}
      onCancel={drilldown.actions.closeModal}
      width="min(900px, 95vw)"
      title={null}
      footer={
        <Button onClick={drilldown.actions.closeModal}>关闭</Button>
      }
      styles={{ body: { padding: 0 } }}
    >
      <DrilldownHeader
        riskGroup={drilldown.riskGroup}
        viewMode={drilldown.state.viewMode}
        onViewModeChange={drilldown.actions.setViewMode}
      />
      <div className={styles.drilldownBody}>
        <CustomerListPanel
          drilldownKey={drilldown.state.drilldownKey}
          riskGroup={drilldown.riskGroup}
          customers={drilldown.filteredCustomers}
          viewMode={drilldown.state.viewMode}
          filterKey={drilldown.state.filterKey}
          keyword={drilldown.state.keyword}
          ownerFilter={drilldown.state.ownerFilter}
          ownerOptions={drilldown.ownerOptions}
          onFilterChange={drilldown.actions.setFilterKey}
          onKeywordChange={drilldown.actions.setKeyword}
          onOwnerFilterChange={drilldown.actions.setOwnerFilter}
        />
      </div>
    </Modal>
  );
};

/** 弹窗头部：描述 + 视图切换 */
const DrilldownHeader: React.FC<{
  riskGroup: DrilldownRiskGroup;
  viewMode: 'all' | 'mine';
  onViewModeChange: (mode: 'all' | 'mine') => void;
}> = ({ riskGroup, viewMode, onViewModeChange }) => (
  <div className={styles.drilldownHeader}>
    <div className={styles.drilldownHeaderLeft}>
      <span className={styles.drilldownCount}>{riskGroup.countText}</span>
    </div>
    <div className={styles.viewSwitch}>
      <button
        type="button"
        className={`${styles.viewBtn} ${viewMode === 'all' ? styles.viewActive : ''}`}
        onClick={() => onViewModeChange('all')}
      >
        全部客户
      </button>
      <button
        type="button"
        className={`${styles.viewBtn} ${viewMode === 'mine' ? styles.viewActive : ''}`}
        onClick={() => onViewModeChange('mine')}
      >
        我的客户
      </button>
    </div>
  </div>
);

export default CustomerDrilldownModal;
