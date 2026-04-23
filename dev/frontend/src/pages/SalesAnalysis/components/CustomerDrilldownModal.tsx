/**
 * 风险客户钻取弹窗
 * 包含视图切换、筛选、客户列表和详情面板
 */

import React from 'react';
import { Modal, Tag, Button } from 'antd';
import CustomerListPanel from './CustomerListPanel';
import CustomerDetailPanel from './CustomerDetailPanel';
import type { RiskLevel, DrilldownRiskGroup, DrilldownCustomer } from '@/types/sales-analysis';
import styles from './CustomerDrilldownModal.less';

interface CustomerDrilldownModalProps {
  drilldown: {
    state: {
      open: boolean;
      riskLevel: RiskLevel;
      viewMode: 'all' | 'mine';
      filterKey: string;
      selectedCustomerId: string | null;
    };
    actions: {
      closeModal: () => void;
      setViewMode: (mode: 'all' | 'mine') => void;
      setFilterKey: (key: string) => void;
      selectCustomer: (id: string) => void;
    };
    riskGroup: DrilldownRiskGroup;
    filteredCustomers: DrilldownCustomer[];
    selectedCustomer: DrilldownCustomer | null;
  };
}

const CustomerDrilldownModal: React.FC<CustomerDrilldownModalProps> = ({ drilldown }) => {
  const footer = (
    <div className={styles.modalFooter}>
      <Button onClick={drilldown.actions.closeModal}>关闭</Button>
      <Button type="primary">分派动作</Button>
    </div>
  );

  return (
    <Modal
      open={drilldown.state.open}
      onCancel={drilldown.actions.closeModal}
      width={960}
      title={null}
      footer={footer}
      styles={{ body: { padding: 0 } }}
    >
      <DrilldownHeader
        riskGroup={drilldown.riskGroup}
        viewMode={drilldown.state.viewMode}
        onViewModeChange={drilldown.actions.setViewMode}
      />
      <div className={styles.drilldownBody}>
        <CustomerListPanel
          riskGroup={drilldown.riskGroup}
          customers={drilldown.filteredCustomers}
          viewMode={drilldown.state.viewMode}
          filterKey={drilldown.state.filterKey}
          selectedCustomerId={drilldown.selectedCustomer?.id || null}
          onFilterChange={drilldown.actions.setFilterKey}
          onSelectCustomer={drilldown.actions.selectCustomer}
        />
        <CustomerDetailPanel customer={drilldown.selectedCustomer} />
      </div>
    </Modal>
  );
};

/** 弹窗头部子组件 */
const DrilldownHeader: React.FC<{
  riskGroup: DrilldownRiskGroup;
  viewMode: 'all' | 'mine';
  onViewModeChange: (mode: 'all' | 'mine') => void;
}> = ({ riskGroup, viewMode, onViewModeChange }) => (
  <div className={styles.drilldownHeader}>
    <p className={styles.drilldownDesc}>{riskGroup.desc}</p>
    <div className={styles.drilldownHeaderRight}>
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
      <Tag color={riskGroup.tagColor}>{riskGroup.tagText}</Tag>
      <span className={styles.drilldownCount}>{riskGroup.countText}</span>
    </div>
  </div>
);

export default CustomerDrilldownModal;
