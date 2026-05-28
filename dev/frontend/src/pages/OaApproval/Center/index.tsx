/**
 * 审批中心页面
 * 三栏布局：侧边导航 → 审批列表 → 审批详情 + 流程
 */
import React from 'react';
import { Modal, Input, Select } from 'antd';
import { useApprovalCenter } from './hooks/useApprovalCenter';
import ApprovalNav from './components/ApprovalNav';
import ApprovalList from './components/ApprovalList';
import ApprovalDetailPanel from './components/ApprovalDetailPanel';
import type { ViewMode } from '@/types/oa-approval';
import styles from './index.less';

const Center: React.FC = () => {
  const { data, pagination, filters, mobile, rejectModal, transferModal, actions } = useApprovalCenter();

  // 点击导航
  const handleNavClick = (mode: ViewMode) => {
    filters.switchViewMode(mode);
    if (mobile.isMobile) mobile.setMobileView('list');
  };

  // 点击列表项
  const handleItemClick = (item: any) => {
    filters.setSelectedId(item.id);
    if (mobile.isMobile) mobile.setMobileView('detail');
  };

  // 移动端返回列表
  const handleBackToList = () => {
    mobile.setMobileView('list');
    filters.setSelectedId(null);
  };

  return (
    <div className={styles.container}>
      <ApprovalNav viewMode={filters.viewMode} stats={data.stats} onNavClick={handleNavClick} />

      {!mobile.isMobile ? (
        // 桌面端：三栏布局
        <>
          <ApprovalList
            loading={data.loading}
            list={data.list}
            total={data.total}
            page={pagination.page}
            searchText={filters.searchText}
            selectedId={filters.selectedId}
            onSearchTextChange={filters.setSearchText}
            onItemClick={handleItemClick}
            onPageChange={filters.setPage}
          />
          <ApprovalDetailPanel
            detailLoading={data.detailLoading}
            detail={data.detail}
            viewMode={filters.viewMode}
            onApprove={actions.approve}
            onReject={() => rejectModal.setVisible(true)}
            onWithdraw={actions.withdraw}
            onTransfer={actions.openTransfer}
          />
        </>
      ) : mobile.mobileView === 'list' ? (
        // 移动端：列表视图
        <ApprovalList
          loading={data.loading}
          list={data.list}
          total={data.total}
          page={pagination.page}
          searchText={filters.searchText}
          selectedId={filters.selectedId}
          onSearchTextChange={filters.setSearchText}
          onItemClick={handleItemClick}
          onPageChange={filters.setPage}
        />
      ) : (
        // 移动端：详情视图（带返回按钮）
        <ApprovalDetailPanel
          isMobile
          onBack={handleBackToList}
          detailLoading={data.detailLoading}
          detail={data.detail}
          viewMode={filters.viewMode}
          onApprove={actions.approve}
          onReject={() => rejectModal.setVisible(true)}
          onWithdraw={actions.withdraw}
          onTransfer={actions.openTransfer}
        />
      )}

      {/* 拒绝弹窗 */}
      <Modal
        title="拒绝审批"
        open={rejectModal.visible}
        onOk={actions.reject}
        onCancel={() => {
          rejectModal.setVisible(false);
          rejectModal.setReason('');
        }}
        okText="确认拒绝"
        cancelText="取消"
      >
        <Input.TextArea
          placeholder="请输入拒绝原因"
          value={rejectModal.reason}
          onChange={(e) => rejectModal.setReason(e.target.value)}
          rows={4}
        />
      </Modal>

      {/* 转交弹窗 */}
      <Modal
        title="转交审批"
        open={transferModal.visible}
        onOk={actions.transfer}
        onCancel={() => {
          transferModal.setVisible(false);
          transferModal.setUserId(null);
        }}
        okText="确认转交"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>转交人员：</label>
          <Select
            style={{ width: '100%' }}
            placeholder="请选择转交人员"
            value={transferModal.userId}
            onChange={(value) => transferModal.setUserId(value)}
            showSearch
            optionFilterProp="label"
            options={transferModal.users.map((u) => ({ value: u.id, label: u.name }))}
          />
        </div>
      </Modal>
    </div>
  );
};

export default Center;
